# 纹理与 BindGroup

到目前为止，我们一直都是在绘制非常简单的形状。虽然我们确实可以只用三角形来制作游戏，但如果像这样绘制多边形细节极多的物体，会大幅影响游戏对设备的兼容性。所幸我们可以通过**纹理**（texture）来解决这个问题。

纹理是叠加在三角形网格上的图像，使其看起来能具备更丰富的细节。纹理也具有多种类型，如法线贴图、凹凸贴图、镜面贴图和漫反射贴图等。此处我们将介绍漫反射贴图，或者说得更简单点，颜色纹理。

## 从文件中读取图像

如果我们想把图像映射到多边形上，那至少先需要有一张图像。让我们使用这棵快乐小树的图片吧：

![a happy tree](./happy-tree.png)

我们将使用 [image crate](https://crates.io/crates/image) 来加载这张图片。我们已经在第一节中加入了对此的依赖，所以可以直接使用这个 crate。

在 `State` 的 `new()` 方法中配置了 `surface` 之后，添加以下内容即可：

```rust
surface.configure(&device, &config);
// NEW!

let diffuse_bytes = include_bytes!("happy-tree.png");
let diffuse_image = image::load_from_memory(diffuse_bytes).unwrap();
let diffuse_rgba = diffuse_image.as_rgba8().unwrap();

use image::GenericImageView;
let dimensions = diffuse_image.dimensions();
```

这里我们从图像文件中读取了字节数据，将其加载到了 image 对象中，并进一步将其转为了 rgba 字节形式的 `Vec`。我们还保存了图像的尺寸，以便在创建实际 `Texture` 时使用。

现在让我们来创建 `Texture`：

```rust
let texture_size = wgpu::Extent3d {
    width: dimensions.0,
    height: dimensions.1,
    depth_or_array_layers: 1,
};
let diffuse_texture = device.create_texture(
    &wgpu::TextureDescriptor {
        // 所有纹理都会以三维数组形式存储，我们通过设置深度为 1 来表示这是二维的纹理
        size: texture_size,
        mip_level_count: 1, // 我们后面会介绍这里的细节
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        // 多数图像都使用 sRGB 格式，所以我们需要在此将其体现出来
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        // TEXTURE_BINDING 告诉 wgpu 我们想在着色器中使用这个纹理
        // COPY_DST 则表示我们想把数据复制到这个纹理
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        label: Some("diffuse_texture"),
    }
);
```

## 将数据读取进纹理

`Texture` struct 上并没有能直接操作其数据的方法。但我们可以使用先前创建的 `queue` 上的 `write_texture` 方法来加载纹理。让我们看看这应该如何实现：

```rust
queue.write_texture(
    // 告诉 wgpu 从何处复制像素数据
    wgpu::ImageCopyTexture {
        texture: &diffuse_texture,
        mip_level: 0,
        origin: wgpu::Origin3d::ZERO,
        aspect: wgpu::TextureAspect::All,
    },
    // 实际的像素数据
    diffuse_rgba,
    // 纹理的内存布局
    wgpu::ImageDataLayout {
        offset: 0,
        bytes_per_row: std::num::NonZeroU32::new(4 * dimensions.0),
        rows_per_image: std::num::NonZeroU32::new(dimensions.1),
    },
    texture_size,
);
```

<div class="note">

向纹理中写入数据的经典方法是将像素数据复制到一个缓冲区，然后再将其复制到纹理中。使用 `write_texture` 则更为高效，因为这样可以少用一个缓冲区——不过这里还是选择介绍这一写法，以备万一之用。

```rust
let buffer = device.create_buffer_init(
    &wgpu::util::BufferInitDescriptor {
        label: Some("Temp Buffer"),
        contents: &diffuse_rgba,
        usage: wgpu::BufferUsages::COPY_SRC,
    }
);

let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
    label: Some("texture_buffer_copy_encoder"),
});

encoder.copy_buffer_to_texture(
    wgpu::ImageCopyBuffer {
        buffer: &buffer,
        offset: 0,
        bytes_per_row: 4 * dimensions.0,
        rows_per_image: dimensions.1,
    },
    wgpu::ImageCopyTexture {
        texture: &diffuse_texture,
        mip_level: 0,
        array_layer: 0,
        origin: wgpu::Origin3d::ZERO,
    },
    size,
);

queue.submit(std::iter::once(encoder.finish()));
```

为 `bytes_per_row` 字段所赋的值需要有一些考量，这个值需要是 256 的倍数。可以查阅 [gif 教程](././showcase/gifs) 以了解更多相关细节。

</div>

## TextureView 与 Sampler

现在纹理中已经有了数据，下面就需要以某种方法来使用它。这就要用到 `TextureView` 和 `Sampler` 了。`TextureView` 相当于对纹理数据的一种*视图*，而 `Sampler` 用于控制 `Texture` 如何被*采样*。采样过程类似于 GIMP 或 Photoshop 中的滴管取色工具，程序支持读入用于定位纹理上位置的坐标（亦即*纹理坐标*），然后采样器就会根据纹理内容和一些内部参数来返回相应位置的颜色。

现在让我们来定义 `diffuse_texture_view` 和 `diffuse_sampler` 吧：

```rust
// 我们无需手动配置纹理视图，让 wgpu 定义它即可
let diffuse_texture_view = diffuse_texture.create_view(&wgpu::TextureViewDescriptor::default());
let diffuse_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
    address_mode_u: wgpu::AddressMode::ClampToEdge,
    address_mode_v: wgpu::AddressMode::ClampToEdge,
    address_mode_w: wgpu::AddressMode::ClampToEdge,
    mag_filter: wgpu::FilterMode::Linear,
    min_filter: wgpu::FilterMode::Nearest,
    mipmap_filter: wgpu::FilterMode::Nearest,
    ..Default::default()
});
```

如果采样器接收到的纹理坐标在纹理本身之外，那么 `address_mode_*` 参数可用于决定此时的处理机制。这里有几个选项可供选择：

* `ClampToEdge`：对任何在纹理之外的纹理坐标，都返回离纹理边缘最近像素的颜色。
* `Repeat`：当纹理坐标超过纹理尺寸时，纹理将重复。
* `MirrorRepeat`：类似于 `Repeat`，但图像在越过边界时将翻转。

![address_mode.png](./address_mode.png)

`mag_filter` 和 `min_filter` 选项描述了当一个片元覆盖了多个像素，或一个像素内存在多个片元时，应当做怎样的处理。当从近处或远处观察一个多边形表面时，这个配置经常会带来影响。

这里有两种选项：
* `Linear`：尝试混合中间的片元，使它们看起来平滑。
* `Nearest`：中间的片元将使用最近像素的颜色。这样可以获得从远处看较为锐利的图像，但从近处看来则会有像素化的效果。不过如果纹理本身就被设计成像素化形式（如像素艺术游戏或像 Minecraft 这样的体素游戏），这个配置的效果也可能符合预期。

Mipmap 是一个复杂的话题，将来应当有[独立的章节](/todo)。现在我们可以简单认为 `mipmap_filter` 的功能类似于 `(mag/min)_filter`，它会告诉采样器该如何在各个层级的 mipmap 之间做混合。

这里对其他字段使用了一些默认值。如果想详细了解其配置，请查看 [wgpu 文档](https://docs.rs/wgpu/0.12.0/wgpu/struct.SamplerDescriptor.html)。

虽然这些不同的资源类型都很强大，但如果无法将它们接入渲染系统中，那也没有实际的用处。为了达到这一点，就需要使用 `BindGroup` 和 `PipelineLayout` 了。

## 介绍 BindGroup

`BindGroup` 可以描述一组资源，并确定它们应当如何被着色器所访问。`BindGroup` 可以用 `BindGroupLayout` 来创建。让我们先动手实现一个：

```rust
let texture_bind_group_layout = device.create_bind_group_layout(
    &wgpu::BindGroupLayoutDescriptor {
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    multisampled: false,
                    view_dimension: wgpu::TextureViewDimension::D2,
                    sample_type: wgpu::TextureSampleType::Float { filterable: true },
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Sampler(
                    // SamplerBindingType::Comparison 仅可供 TextureSampleType::Depth 使用
                    // 如果纹理的 sample_type 是 TextureSampleType::Float { filterable: true }
                    // 那么就应当使用 SamplerBindingType::Filtering
                    // 否则会报错
                    wgpu::SamplerBindingType::Filtering,
                ),
                count: None,
            },
        ],
        label: Some("texture_bind_group_layout"),
    }
);
```

`texture_bind_group_layout` 有两个入口：一个是绑定到 0 的被采样纹理，另一个是绑定到 1 的采样器。这两个绑定只对由 `FRAGMENT` 常量所指定的片元着色器可见。这个字段的可选值是 `NONE`、`VERTEX`、`FRAGMENT` 或 `COMPUTE` 的任意位数组合。大多数情况下，我们只会对纹理和采样器使用 `FRAGMENT` 配置，但其他的可选项也值得了解。

有了 `texture_bind_group_layout` 之后，我们就可以创建 `BindGroup` 了：

```rust
let diffuse_bind_group = device.create_bind_group(
    &wgpu::BindGroupDescriptor {
        layout: &texture_bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&diffuse_texture_view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(&diffuse_sampler),
            }
        ],
        label: Some("diffuse_bind_group"),
    }
);
```

上面的代码可能会让你产生一点既视感！这是因为 `BindGroup` 是 `BindGroupLayout` 的一份更为具体的声明。将它们分离的原因是这样允许我们在运行时动态交换不同的 `BindGroup`，只要它们都共享同一个 `BindGroupLayout` 即可。我们创建的每个纹理和采样器都需要添加到某个 `BindGroup` 中。此处我们将为每个纹理创建一个新的 bind group。

现在我们有了 `diffuse_bind_group`，可以将其添加到 `State` struct 中：

```rust
struct State {
    surface: wgpu::Surface,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    size: winit::dpi::PhysicalSize<u32>,
    render_pipeline: wgpu::RenderPipeline,
    vertex_buffer: wgpu::Buffer,
    index_buffer: wgpu::Buffer,
    num_indices: u32,
    diffuse_bind_group: wgpu::BindGroup, // NEW!
}
```

请确保在 `new` 方法中返回这些字段：

```rust
impl State {
    async fn new() -> Self {
        // ...
        Self {
            surface,
            device,
            queue,
            config,
            size,
            render_pipeline,
            vertex_buffer,
            index_buffer,
            num_indices,
            // NEW!
            diffuse_bind_group,
        }
    }
}
```

现在我们已经获得了 `BindGroup`，可以在 `render()` 函数中使用它了：

```rust
// render()
// ...
render_pass.set_pipeline(&self.render_pipeline);
render_pass.set_bind_group(0, &self.diffuse_bind_group, &[]); // NEW!
render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
render_pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16);

render_pass.draw_indexed(0..self.num_indices, 0, 0..1);
```

## 介绍 PipelineLayout

还记得我们在 [pipeline 章节](/beginner/tutorial3-pipeline#how-do-we-use-the-shaders)中创建的 `PipelineLayout` 吗？现在我们终于要用到它了！`PipelineLayout` 包含一份可供管线使用的 `BindGroupLayout` 列表。修改 `render_pipeline_layout` 后即可使用我们的 `texture_bind_group_layout`：

```rust
async fn new(...) {
    // ...
    let render_pipeline_layout = device.create_pipeline_layout(
        &wgpu::PipelineLayoutDescriptor {
            label: Some("Render Pipeline Layout"),
            bind_group_layouts: &[&texture_bind_group_layout], // NEW!
            push_constant_ranges: &[],
        }
    );
    // ...
}
```

## 对 VERTICES 的改动
现在我们需要对 `Vertex` 的定义做一些改动。到目前为止，我们一直是在使用 `color` 属性来设置我们所绘制形体的颜色。现在我们使用了纹理，因此可以用记录纹理坐标的 `tex_coords` 来代替 `color`，这些坐标将被传递给 `Sampler` 以获取适当的颜色。

由于我们的 `tex_coords` 是二维的，因此我们需要将这个字段改为使用两个浮点数，而非原先的三个。

首先我们需要改变 `Vertex` struct：

```rust
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
struct Vertex {
    position: [f32; 3],
    tex_coords: [f32; 2], // NEW!
}
```

然后在 `VertexBufferLayout` 中反映这些变化：

```rust
impl Vertex {
    fn desc<'a>() -> wgpu::VertexBufferLayout<'a> {
        use std::mem;
        wgpu::VertexBufferLayout {
            array_stride: mem::size_of::<Vertex>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[
                wgpu::VertexAttribute {
                    offset: 0,
                    shader_location: 0,
                    format: wgpu::VertexFormat::Float32x3,
                },
                wgpu::VertexAttribute {
                    offset: mem::size_of::<[f32; 3]>() as wgpu::BufferAddress,
                    shader_location: 1,
                    format: wgpu::VertexFormat::Float32x2, // NEW!
                },
            ]
        }
    }
}
```

最后我们需要改变 `VERTICES` 的内容，用以下数据取代现有的定义：

```rust
// Changed
const VERTICES: &[Vertex] = &[
    Vertex { position: [-0.0868241, 0.49240386, 0.0], tex_coords: [0.4131759, 0.99240386], }, // A
    Vertex { position: [-0.49513406, 0.06958647, 0.0], tex_coords: [0.0048659444, 0.56958647], }, // B
    Vertex { position: [-0.21918549, -0.44939706, 0.0], tex_coords: [0.28081453, 0.05060294], }, // C
    Vertex { position: [0.35966998, -0.3473291, 0.0], tex_coords: [0.85967, 0.1526709], }, // D
    Vertex { position: [0.44147372, 0.2347359, 0.0], tex_coords: [0.9414737, 0.7347359], }, // E
];
```

## 着色器时间

有了新的 `Vertex` 结构后，就该修改着色器了。我们首先需要将 `tex_coords` 传递给顶点着色器，然后再将它们用于片元着色器，以便从 `Sampler` 中获得最终的颜色。让我们从顶点着色器开始：

```wgsl
// 顶点着色器

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
    out.clip_position = vec4<f32>(model.position, 1.0);
    return out;
}
```

现在顶点着色器会输出 `tex_coords`，我们需要改变片元着色器来接收它们。有了这些坐标，我们就终于可以用采样器从纹理中获取颜色了：

```wgsl
// 片元着色器

[[group(0), binding(0)]]
var t_diffuse: texture_2d<f32>;
[[group(0), binding(1)]]
var s_diffuse: sampler;

[[stage(fragment)]]
fn fs_main(in: VertexOutput) -> [[location(0)]] vec4<f32> {
    return textureSample(t_diffuse, s_diffuse, in.tex_coords);
}
```

这里的变量 `t_diffuse` 和 `s_diffuse` 就是所谓的 uniform。我们将在[相机部分](/beginner/tutorial6-uniforms/)中进一步讨论它们。现在我们所需要知道的是，`group()` 对应于 `set_bind_group()` 中的第一个参数，`binding()` 则与我们创建 `BindGroupLayout` 和 `BindGroup` 时所指定的 `binding` 有关。

## 渲染结果

如果现在运行我们的程序，应该得到以下结果：

![an upside down tree on a hexagon](./upside-down.png)

这很奇怪，我们的树上下颠倒了！这是因为 wgpu 中世界坐标系的 Y 轴指向上方，而纹理坐标系的 Y 轴指向下方。换句话说，纹理坐标中的 `(0, 0)` 对应图像的左上角，而 `(1,1)` 对应右下角。

![happy-tree-uv-coords.png](./happy-tree-uv-coords.png)

我们可以将每个纹理坐标的 y 坐标 `y` 替换为 `1 - y`，以此得到三角形的正确朝向。

```rust
const VERTICES: &[Vertex] = &[
    // Changed
    Vertex { position: [-0.0868241, 0.49240386, 0.0], tex_coords: [0.4131759, 0.00759614], }, // A
    Vertex { position: [-0.49513406, 0.06958647, 0.0], tex_coords: [0.0048659444, 0.43041354], }, // B
    Vertex { position: [-0.21918549, -0.44939706, 0.0], tex_coords: [0.28081453, 0.949397], }, // C
    Vertex { position: [0.35966998, -0.3473291, 0.0], tex_coords: [0.85967, 0.84732914], }, // D
    Vertex { position: [0.44147372, 0.2347359, 0.0], tex_coords: [0.9414737, 0.2652641], }, // E
];
```

这样就可以把树正确地放在五边形上了：

![our happy tree as it should be](./rightside-up.png)

## 整理总结

为方便起见，我们希望把纹理代码整理进其对应的模块。我们首先需要将 [anyhow](https://docs.rs/anyhow/) crate 添加到 `Cargo.toml` 文件中，以简化错误处理：

```toml
[dependencies]
image = "0.23"
cgmath = "0.18"
winit = "0.26"
env_logger = "0.9"
log = "0.4"
pollster = "0.2"
wgpu = "0.12"
bytemuck = { version = "1.4", features = [ "derive" ] }
anyhow = "1.0" # NEW!
```

然后在一个名为 `src/texture.rs` 的新文件中，添加以下内容：

```rust
use image::GenericImageView;
use anyhow::*;

pub struct Texture {
    pub texture: wgpu::Texture,
    pub view: wgpu::TextureView,
    pub sampler: wgpu::Sampler,
}

impl Texture {
    pub fn from_bytes(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        bytes: &[u8], 
        label: &str
    ) -> Result<Self> {
        let img = image::load_from_memory(bytes)?;
        Self::from_image(device, queue, &img, Some(label))
    }

    pub fn from_image(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        img: &image::DynamicImage,
        label: Option<&str>
    ) -> Result<Self> {
        let rgba = img.as_rgba8().unwrap();
        let dimensions = img.dimensions();

        let size = wgpu::Extent3d {
            width: dimensions.0,
            height: dimensions.1,
            depth_or_array_layers: 1,
        };
        let texture = device.create_texture(
            &wgpu::TextureDescriptor {
                label,
                size,
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8UnormSrgb,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            }
        );

        queue.write_texture(
            wgpu::ImageCopyTexture {
                aspect: wgpu::TextureAspect::All,
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
            },
            rgba,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: std::num::NonZeroU32::new(4 * dimensions.0),
                rows_per_image: std::num::NonZeroU32::new(dimensions.1),
            },
            size,
        );

        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let sampler = device.create_sampler(
            &wgpu::SamplerDescriptor {
                address_mode_u: wgpu::AddressMode::ClampToEdge,
                address_mode_v: wgpu::AddressMode::ClampToEdge,
                address_mode_w: wgpu::AddressMode::ClampToEdge,
                mag_filter: wgpu::FilterMode::Linear,
                min_filter: wgpu::FilterMode::Nearest,
                mipmap_filter: wgpu::FilterMode::Nearest,
                ..Default::default()
            }
        );
        
        Ok(Self { texture, view, sampler })
    }
}
```

注意我们要用纹理返回一个 `CommandBuffer`。这意味着我们可以同时加载多个纹理，然后再一次性提交所有的命令缓冲区。

我们需要将 `texture.rs` 作为模块导入，所以需在 `main.rs` 顶部添加以下内容：

```rust
mod texture;
```

这样 `new()` 中的纹理创建代码就变得简单多了：

```rust
surface.configure(&device, &config);
let diffuse_bytes = include_bytes!("happy-tree.png"); // CHANGED!
let diffuse_texture = texture::Texture::from_bytes(&device, &queue, diffuse_bytes, "happy-tree.png").unwrap(); // CHANGED!

// 所有到 `let texture_bind_group_layout = ...` 为止的部分现在都可以移除了
```

我们仍然需要单独存储 bind group，这样 `Texture` 就不需要知道 `BindGroup` 是如何布局的了。这样创建 `diffuse_bind_group` 的过程略有变化，会用到 `diffuse_texture` 的 `view` 和 `sampler` 字段：

```rust
let diffuse_bind_group = device.create_bind_group(
    &wgpu::BindGroupDescriptor {
        layout: &texture_bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&diffuse_texture.view), // CHANGED!
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(&diffuse_texture.sampler), // CHANGED!
            }
        ],
        label: Some("diffuse_bind_group"),
    }
);
```

最后只需更新 `State` 字段，就可以用上我们闪亮的新 `Texture` 结构了。在后续教程中我们还会用到它：

```rust
struct State {
    // ...
    diffuse_bind_group: wgpu::BindGroup,
    diffuse_texture: texture::Texture, // NEW
}
```

```rust
impl State {
    async fn new() -> Self {
        // ...
        Self {
            // ...
            num_indices,
            diffuse_bind_group,
            diffuse_texture, // NEW
        }
    }
}
```

哦吼！

引入这些改变后，代码的工作方式仍然和之前相同，但现在我们就能更方便地创建纹理了。

## 小测验

尝试创建另一个纹理，并在按下空格键时将其换掉。

<AutoGithubLink/>
