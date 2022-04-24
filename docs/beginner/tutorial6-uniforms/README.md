# Uniform 缓冲区与 3D 相机

虽然我们之前的工作似乎都是在二维世界中进行的，但实际上我们一直都在三维空间中工作！这就是为什么 `Vertex` struct 中的 `position` 是带有 3 个浮点数的数组，而不是 2 个。下面我们将通过创建一个 `Camera` 来改变视角。

## 建模透视相机

本教程更多介绍的是对 wgpu 的使用，而非线性代数。所以此处将略过很多涉及的数学知识。如果你对这背后发生的事情感兴趣，可以在网上找到大量的阅读材料。首先要知道的是，在我们的 `Cargo.toml` 中需要依赖 `cgmath = "0.18"`。

有了数学库之后，就让我们把它用起来吧！首先在 `State` struct 上方创建一个 `Camera` struct：

```rust
struct Camera {
    eye: cgmath::Point3<f32>,
    target: cgmath::Point3<f32>,
    up: cgmath::Vector3<f32>,
    aspect: f32,
    fovy: f32,
    znear: f32,
    zfar: f32,
}

impl Camera {
    fn build_view_projection_matrix(&self) -> cgmath::Matrix4<f32> {
        // 1.
        let view = cgmath::Matrix4::look_at_rh(self.eye, self.target, self.up);
        // 2.
        let proj = cgmath::perspective(cgmath::Deg(self.fovy), self.aspect, self.znear, self.zfar);

        // 3.
        return OPENGL_TO_WGPU_MATRIX * proj * view;
    }
}
```

`build_view_projection_matrix` 就是奇迹发生的地方。
1. `view` 矩阵将世界移动并旋转到摄像机所观察的位置。它实质上是摄像机的变换矩阵对应的逆矩阵。
2. `proj` 矩阵将场景包裹起来，以产生深度的效果。如果没有它，近处的物体和远处的物体就会有相同的大小。
3. Wgpu 的坐标系统是基于 DirectX 和 Metal 的坐标系统。这意味着在[归一化设备坐标](https://github.com/gfx-rs/gfx/tree/master/src/backend/dx12#normalized-coordinates)中，x 轴和 y 轴的范围是 -1.0 到 +1.0，而 z 轴是 0.0 到 +1.0。`cgmath` crate（以及大多数游戏数学 crate）是为 OpenGL 的坐标系统而设计的。这个矩阵将把场景从 OpenGL 的坐标系扩展和翻译成 wgpu 的坐标系。我们对它有如下定义：

```rust
#[rustfmt::skip]
pub const OPENGL_TO_WGPU_MATRIX: cgmath::Matrix4<f32> = cgmath::Matrix4::new(
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 0.5, 0.0,
    0.0, 0.0, 0.5, 1.0,
);
```

* 注意：`OPENGL_TO_WGPU_MATRIX` 对我们并非**必需**。但若不使用它，以 `(0, 0, 0)` 为中心的模型会在裁剪区域内偏移一半。这个问题只有在不使用摄像机矩阵时才会出现。

现在让我们在 `State` 中添加一个 `camera` 字段：

```rust
struct State {
    // ...
    camera: Camera,
    // ...
}

async fn new(window: &Window) -> Self {
    // let diffuse_bind_group ...

    let camera = Camera {
        // 将相机向上移动 1 个单位，向后移动 2 个单位
        // +z 对应屏幕外侧方向
        eye: (0.0, 1.0, 2.0).into(),
        // 将相机朝向原点
        target: (0.0, 0.0, 0.0).into(),
        // 定义哪个方向朝上
        up: cgmath::Vector3::unit_y(),
        aspect: config.width as f32 / config.height as f32,
        fovy: 45.0,
        znear: 0.1,
        zfar: 100.0,
    };

    Self {
        // ...
        camera,
        // ...
    }
}
```

现在我们有了相机，它可以为我们提供相应的视图投影矩阵。为此我们需要放置这些字段，也需要一些方法将其引入着色器中。

## Uniform 缓冲区

到目前为止，我们都在用 `Buffer` 来存储顶点和索引数据，甚至还用它来加载纹理。下面将再次用它们来创建一个所谓的 uniform 缓冲区。Uniform 缓冲区也是一个数据块，在一组着色器的每次调用中都可以使用它。从技术角度看来，我们先前配置的纹理和采样器实际上也都属于 uniform。我们将继续用 uniform 缓冲区来存储视图投影矩阵，为此可以先创建一个 struct 来保存 uniform：

```rust
// 我们需要这个标注来让 Rust 正确存储用于着色器的数据
#[repr(C)]
// 这样配置可以让我们将其存储在缓冲区之中
#[derive(Debug, Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct CameraUniform {
    // 我们不能将 bytemuck 与 cgmath 直接一起使用
    // 因此需要先将 Matrix4 矩阵转为一个 4x4 的 f32 数组
    view_proj: [[f32; 4]; 4],
}

impl CameraUniform {
    fn new() -> Self {
        use cgmath::SquareMatrix;
        Self {
            view_proj: cgmath::Matrix4::identity().into(),
        }
    }

    fn update_view_proj(&mut self, camera: &Camera) {
        self.view_proj = camera.build_view_projection_matrix().into();
    }
}
```

现在我们已经完成数据建模，可以继续制作 `camera_buffer` 了：

```rust
// 在创建 `camera` 后的 new() 中

let mut camera_uniform = CameraUniform::new();
camera_uniform.update_view_proj(&camera);

let camera_buffer = device.create_buffer_init(
    &wgpu::util::BufferInitDescriptor {
        label: Some("Camera Buffer"),
        contents: bytemuck::cast_slice(&[camera_uniform]),
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    }
);
```

## Uniform 缓冲区与 Bind Group

很好，现在我们已经有了一个 uniform 缓冲区，该如何使用它呢？答案还是为它创建一个 bind group。首先，我们仍然需要创建 bind group 的布局：

```rust
let camera_bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
    entries: &[
        wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }
    ],
    label: Some("camera_bind_group_layout"),
});
```

1. 我们只需在顶点着色器中用到相机信息，因为我们将用它来变换顶点（而非片元）。
2. `dynamic` 字段表明这个缓冲区是否会改变大小。如果我们想在 uniform 中存储一个数组，这会很有用。

现在我们可以创建实际的 bind group 了：

```rust
let camera_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
    layout: &camera_bind_group_layout,
    entries: &[
        wgpu::BindGroupEntry {
            binding: 0,
            resource: camera_buffer.as_entire_binding(),
        }
    ],
    label: Some("camera_bind_group"),
});
```

就像对纹理那样，我们也需要在渲染管线中注册 `camera_bind_group_layout`：

```rust
let render_pipeline_layout = device.create_pipeline_layout(
    &wgpu::PipelineLayoutDescriptor {
        label: Some("Render Pipeline Layout"),
        bind_group_layouts: &[
            &texture_bind_group_layout,
            &camera_bind_group_layout,
        ],
        push_constant_ranges: &[],
    }
);
```

现在我们需要将 `camera_buffer` 和 `camera_bind_group` 添加到 `State` 中：

```rust
struct State {
    // ...
    camera: Camera,
    camera_uniform: CameraUniform,
    camera_buffer: wgpu::Buffer,
    camera_bind_group: wgpu::BindGroup,
}

async fn new(window: &Window) -> Self {
    // ...
    Self {
        // ...
        camera,
        camera_uniform,
        camera_buffer,
        camera_bind_group,
    }
}
```

在进入着色器之前，我们需要做的最后一件事是在 `render()` 中使用 bind group：

```rust
render_pass.set_pipeline(&self.render_pipeline);
render_pass.set_bind_group(0, &self.diffuse_bind_group, &[]);
// NEW!
render_pass.set_bind_group(1, &self.camera_bind_group, &[]);
render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
render_pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16);

render_pass.draw_indexed(0..self.num_indices, 0, 0..1);
```

## 在顶点着色器中使用 Uniform

修改顶点着色器以加入以下内容：

```wgsl
// 顶点着色器
struct CameraUniform {
    view_proj: mat4x4<f32>;
};
[[group(1), binding(0)]] // 1.
var<uniform> camera: CameraUniform;

struct VertexInput {
    [[location(0)]] position: vec3<f32>;
    [[location(1)]] tex_coords: vec2<f32>;
};

struct VertexOutput {
    [[builtin(position)]] clip_position: vec4<f32>;
    [[location(0)]] tex_coords: vec2<f32>;
};

[[stage(vertex)]]
fn vs_main(
    model: VertexInput,
) -> VertexOutput {
    var out: VertexOutput;
    out.tex_coords = model.tex_coords;
    out.clip_position = camera.view_proj * vec4<f32>(model.position, 1.0); // 2.
    return out;
}
```

1. 因为我们又创建了一个新的 bind group，我们需要指定在着色器中使用哪一个。这个数字是由 `render_pipeline_layout` 所决定的。`texture_bind_group_layout` 被列在第一位，因此它是 `group(0)`；`camera_bind_group` 位于第二位，因此它是 `group(1)`。
2. 当涉及到矩阵时，乘法顺序很重要。此处矢量要放在最右边，矩阵则在左边。

## 为相机建立控制器

如果你现在运行这段代码，你应该获得形如这样的效果：

![./static-tree.png](./static-tree.png)

现在形状的拉伸度降低了，但它看起来仍然相当静态。你可以尝试移动摄像机的位置，就像大多数游戏里所做的那样。但由于本教程的重点是如何使用 wgpu 而非如何处理用户输入，因此这里只在下面贴出 `CameraController` 的代码：

```rust
struct CameraController {
    speed: f32,
    is_forward_pressed: bool,
    is_backward_pressed: bool,
    is_left_pressed: bool,
    is_right_pressed: bool,
}

impl CameraController {
    fn new(speed: f32) -> Self {
        Self {
            speed,
            is_forward_pressed: false,
            is_backward_pressed: false,
            is_left_pressed: false,
            is_right_pressed: false,
        }
    }

    fn process_events(&mut self, event: &WindowEvent) -> bool {
        match event {
            WindowEvent::KeyboardInput {
                input: KeyboardInput {
                    state,
                    virtual_keycode: Some(keycode),
                    ..
                },
                ..
            } => {
                let is_pressed = *state == ElementState::Pressed;
                match keycode {
                    VirtualKeyCode::W | VirtualKeyCode::Up => {
                        self.is_forward_pressed = is_pressed;
                        true
                    }
                    VirtualKeyCode::A | VirtualKeyCode::Left => {
                        self.is_left_pressed = is_pressed;
                        true
                    }
                    VirtualKeyCode::S | VirtualKeyCode::Down => {
                        self.is_backward_pressed = is_pressed;
                        true
                    }
                    VirtualKeyCode::D | VirtualKeyCode::Right => {
                        self.is_right_pressed = is_pressed;
                        true
                    }
                    _ => false,
                }
            }
            _ => false,
        }
    }

    fn update_camera(&self, camera: &mut Camera) {
        use cgmath::InnerSpace;
        let forward = camera.target - camera.eye;
        let forward_norm = forward.normalize();
        let forward_mag = forward.magnitude();

        // 防止摄像机离场景中心太近时出现故障
        if self.is_forward_pressed && forward_mag > self.speed {
            camera.eye += forward_norm * self.speed;
        }
        if self.is_backward_pressed {
            camera.eye -= forward_norm * self.speed;
        }

        let right = forward_norm.cross(camera.up);

        // 在按下前进或后退键时重做半径计算
        let forward = camera.target - camera.eye;
        let forward_mag = forward.magnitude();

        if self.is_right_pressed {
            // 重新调整目标与眼睛之间的距离，以使其不发生变化
            // 因此，眼睛仍位于由目标和眼睛所组成的圆上。
            camera.eye = camera.target - (forward + right * self.speed).normalize() * forward_mag;
        }
        if self.is_left_pressed {
            camera.eye = camera.target - (forward - right * self.speed).normalize() * forward_mag;
        }
    }
}
```

这段代码并不完美。当你旋转相机时，相机会慢慢向后移动。但它可以满足我们的需求，你也可以继续改进它！

我们仍然需要把这个实现插入到现有的代码中以使其生效。为此可将控制器添加到 `State` 中，并在 `new()` 时创建它：

```rust
struct State {
    // ...
    camera: Camera,
    // NEW!
    camera_controller: CameraController,
    // ...
}
// ...
impl State {
    async fn new(window: &Window) -> Self {
        // ...
        let camera_controller = CameraController::new(0.2);
        // ...

        Self {
            // ...
            camera_controller,
            // ...
        }
    }
}
```

假如你还没有改动过 `input()`，现在我们终于要给它添加一些代码了！

```rust
fn input(&mut self, event: &WindowEvent) -> bool {
    self.camera_controller.process_events(event)
}
```

到目前为止，摄像机控制器实际上还没有真正工作起来。我们在 uniform 缓冲区中的值需要被更新。有几种常用的手段可以做到这一点：
1. 我们可以创建一个单独的缓冲区，并把它的内容复制到 `camera_buffer`。这个新的缓冲区被称为暂存缓冲区（staging buffer）。这是一种常见的方法，因为它允许主缓冲区（在这种情况下是 `camera_buffer`）的内容只被 GPU 访问，从而可让 GPU 做一些性能优化。如果也能通过 CPU 来访问缓冲区，就无法实现此类优化。
2. 我们可以在缓冲区本身调用映射方法的 `map_read_async` 和 `map_write_async`。这些方法允许我们直接访问缓冲区的内容，但需要我们处理这些方法的 `async` 异步性，也需要缓冲区使用 `BufferUsages::MAP_READ` 和（或）`BufferUsages::MAP_WRITE`。这种方法不会在此详述，但如果想了解更多，可以查看 [Wgpu without a window](././showcase/windowless) 教程。
3. 我们可以在 `queue` 上使用 `write_buffer`。

我们将使用上述的第 3 种方法。

```rust
fn update(&mut self) {
    self.camera_controller.update_camera(&mut self.camera);
    self.camera_uniform.update_view_proj(&self.camera);
    self.queue.write_buffer(&self.camera_buffer, 0, bytemuck::cast_slice(&[self.camera_uniform]));
}
```

这就是全部要做的工作了。如果现在运行代码，你应该能看到一个带有树木纹理的五边形，并可以用 wasd 键或方向键来旋转缩放它。

## 小测验

让我们的模型独立于摄像机进行旋转。*提示：你需要另一个矩阵来实现这一点*。

<AutoGithubLink/>
