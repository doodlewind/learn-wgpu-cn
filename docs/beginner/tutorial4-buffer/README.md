# 顶点缓冲区与索引缓冲区

## 终于讲到这里了！
你可能已经厌倦了前文中「我们到讨论 `Buffer` 时再介绍这个」之类的话。现在终于到了讨论它的时候了，但首先……

## 什么是缓冲区？
一段缓冲区就是 GPU 上的一个数据块。缓冲区是连续的，这意味着其中所有数据都会按顺序存储在内存中。缓冲区通常用于存储 struct 或数组这样简单的结构，但它也可以存储更复杂的内容，如树等图式数据结构（只要所有节点都存储在一起，不引用缓冲区以外的内容即可）。我们将经常使用缓冲区，所以让我们从两种最重要的缓冲区开始：顶点缓冲区（vertex buffer）和索引缓冲区（index buffer）。

## 顶点缓冲区
在先前的例子中，我们相当于是在顶点着色器中硬编码了顶点数据。虽然这种方式在启动阶段很方便，但这是不利于长远维护的。我们需要绘制的各类对象会有不同的大小，并且如果每当更新模型时就要重新编译着色器，那会大大拖慢程序速度。作为替代，我们将使用缓冲区来存储待绘制的顶点数据。不过在此之前我们还需要先描述清楚顶点的结构，我们将通过创建一个新的 struct 来说明这一点：

```rust
// main.rs
#[repr(C)]
#[derive(Copy, Clone, Debug)]
struct Vertex {
    position: [f32; 3],
    color: [f32; 3],
}
```

现在每个顶点都有一个位置字段和一个颜色字段，位置表示顶点在三维空间中的坐标，而颜色则对应顶点的 RGB 色值。我们需要让 `Vertex` 支持 `Copy` trait，这样就可以用它来创建缓冲区了。

接下来我们需要组成三角形的实际数据，在 `Vertex` 中添加以下内容即可：

```rust
// main.rs
const VERTICES: &[Vertex] = &[
    Vertex { position: [0.0, 0.5, 0.0], color: [1.0, 0.0, 0.0] },
    Vertex { position: [-0.5, -0.5, 0.0], color: [0.0, 1.0, 0.0] },
    Vertex { position: [0.5, -0.5, 0.0], color: [0.0, 0.0, 1.0] },
];
```

我们按逆时针顺序排列顶点，其位置依次是上、左下和右下。这样做的一部分理由是出于传统习惯考虑，但主要是因为我们在 `render_pipeline` 的 `primitive` 中规定，我们希望三角形的 `front_face` 配置是 `wgpu::FrontFace::Ccw`，这样就可以剔除位于物体背面的面。这意味着对所有应该面向我们的三角形，其顶点都应该按逆时针顺序排列。

有了顶点数据后，我们需要将其存储在一个缓冲区中。为此可给 `State` 添加一个 `vertex_buffer` 字段：

```rust
// main.rs
struct State {
    // ...
    render_pipeline: wgpu::RenderPipeline,

    // NEW!
    vertex_buffer: wgpu::Buffer,

    // ...
}
```

现在就可以在 `new()` 中创建缓冲区了：

```rust
// new()
let vertex_buffer = device.create_buffer_init(
    &wgpu::util::BufferInitDescriptor {
        label: Some("Vertex Buffer"),
        contents: bytemuck::cast_slice(VERTICES),
        usage: wgpu::BufferUsages::VERTEX,
    }
);
```

为了能访问 `wgpu::Device` 上的 `create_buffer_init` 方法，我们必须导入 [DeviceExt](https://docs.rs/wgpu/0.12.0/wgpu/util/trait.DeviceExt.html#tymethod.create_buffer_init) 这个扩展 trait。关于扩展 trait 的更多信息，请查看[这篇文章](http://xion.io/post/code/rust-extension-traits.html)。

要导入扩展 trait，需要在 `main.rs` 顶部的某处输入这一行：

```rust
use wgpu::util::DeviceExt;
```

你会注意到，我们使用 [bytemuck](https://docs.rs/bytemuck/1.2.0/bytemuck/) 将我们的 `VERTICES` 转换成了 `&[u8]`。`create_buffer_init()` 方法需要传入 `&[u8]`，而 `bytemuck::cast_slice` 能实现这个转换。为此应在 `Cargo.toml` 中添加以下内容：

```toml
bytemuck = { version = "1.4", features = [ "derive" ] }
```

我们还需要实现两个 trait 来使 `bytemuck` 工作，它们分别是 [bytemuck::Pod](https://docs.rs/bytemuck/1.3.0/bytemuck/trait.Pod.html) 和 [bytemuck::Zeroable](https://docs.rs/bytemuck/1.3.0/bytemuck/trait.Zeroable.html)。`Pod` 表示我们的 `Vertex` 是朴素的 PLD（[Plain Old Data](https://zh.wikipedia.org/wiki/POD_(%E7%A8%8B%E5%BA%8F%E8%AE%BE%E8%AE%A1))）数据，因此可以将其类型转为 `&[u8]`。而 `Zeroable` 则表示可以对其使用 `std::mem::zeroed()`。我们可以通过修改 `Vertex` struct 来派生出这些方法：

```rust
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
struct Vertex {
    position: [f32; 3],
    color: [f32; 3],
}
```

<div class="note">

如果你的 struct 包含了没有实现 `Pod` 和 `Zeroable` 的类型，那么你需要手动实现这些 trait。但由于这些 trait 不需要我们实现任何方法，因此只需像下面这样即可让代码工作：

```rust
unsafe impl bytemuck::Pod for Vertex {}
unsafe impl bytemuck::Zeroable for Vertex {}
```

</div>

最后我们就可以将 `vertex_buffer` 添加到 `State` struct 中了：

```rust
Self {
    surface,
    device,
    queue,
    config,
    size,
    render_pipeline,
    vertex_buffer,
}
```

## 然后该怎么做呢？
我们需要让 `render_pipeline` 在绘制时使用这个缓冲区，但在此之前我们还需要告诉 `render_pipeline` 该如何读取它。为此我们可以用 `VertexBufferLayout` 和 `vertex_buffers` 字段来完成这一过程，这在前面创建 `render_pipeline` 时也有所提及。

`VertexBufferLayout` 定义了缓冲区在内存中的表示方式。如果没有它，`render_pipeline` 就不知道该如何在着色器中映射缓冲区。下面的描述符配置定义出了一个充满了 `Vertex` 数据的缓冲区：

```rust
wgpu::VertexBufferLayout {
    array_stride: std::mem::size_of::<Vertex>() as wgpu::BufferAddress, // 1.
    step_mode: wgpu::VertexStepMode::Vertex, // 2.
    attributes: &[ // 3.
        wgpu::VertexAttribute {
            offset: 0, // 4.
            shader_location: 0, // 5.
            format: wgpu::VertexFormat::Float32x3, // 6.
        },
        wgpu::VertexAttribute {
            offset: std::mem::size_of::<[f32; 3]>() as wgpu::BufferAddress,
            shader_location: 1,
            format: wgpu::VertexFormat::Float32x3,
        }
    ]
}
```

代码注释中标注出的重要事项如下：
1. `array_stride` 定义了每个顶点的宽度。当着色器读取下一个顶点时，它将向前跳过 `array_stride` 对应的字节数。在我们的例子中，`array_stride` 应当是 24 字节左右。
2. `step_mode` 告诉 pipeline 应以怎样的频率移动到下一个顶点。在现在的例子中这似乎有点多余，但如果我们只想在开始进行一次新实例化绘制时改变顶点，可以将其设置为 `wgpu::VertexStepMode::Instance`。我们将在后面的教程中介绍实例化绘制（instancing）。
3. `attributes` 描述了顶点中各个属性（attribute）的结构。一般来说这是与 Rust struct 中字段 1:1 的映射，在现有例子中就是如此。
4. `offset` 定义了每个属性开始前应偏移的字节数。对顶点的第一个属性，其偏移量通常为零。对所有后面的属性，其偏移量应为在其之前各属性的 `size_of` 之和。
5. 这里告诉着色器要从哪个位置获取这个属性。例如，顶点着色器中的 `[[location(0)]] x: vec3<f32>` 将对应 `Vertex` struct 中的 `position` 字段，而 `[[location(1)]] x: vec3<f32>` 将对应 `color` 字段。
6. `format` 告诉着色器该属性的形状。`Float32x3` 对应着色器代码中的 `vec3<f32>`。我们可以在一个属性中存储的最大尺寸是 `Float32x4`（或者也可以是 `Uint32x4` 和 `Sint32x4`）。当我们需要存储尺寸比 `Float32x4` 更大的数据时，需要考虑到这一点。

可以用示意图直观地表示我们所定义出的顶点缓冲区，其大致如下所示：

![A figure of the VertexBufferLayout](./vb_desc.png)

现在我们需要 `Vertex` 上创建一个静态方法，以返回上面定义出的描述符配置：

```rust
// main.rs
impl Vertex {
    fn desc<'a>() -> wgpu::VertexBufferLayout<'a> {
        wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<Vertex>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[
                wgpu::VertexAttribute {
                    offset: 0,
                    shader_location: 0,
                    format: wgpu::VertexFormat::Float32x3,
                },
                wgpu::VertexAttribute {
                    offset: std::mem::size_of::<[f32; 3]>() as wgpu::BufferAddress,
                    shader_location: 1,
                    format: wgpu::VertexFormat::Float32x3,
                }
            ]
        }
    }
}
```

<div class="note">

像上面这样配置属性是非常冗长的。为此可以使用 wgpu 提供的 `vertex_attr_array` 宏来做一些简化，从而使 `VertexBufferLayout` 变成这样：

```rust
wgpu::VertexBufferLayout {
    array_stride: std::mem::size_of::<Vertex>() as wgpu::BufferAddress,
    step_mode: wgpu::VertexStepMode::Vertex,
    attributes: &wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3],
}
```

虽然影响不大，但注意 Rust 会认为 `vertex_attr_array` 的结果是一个临时值，所以需要做点调整才能从函数中返回它。为此可以将 `wgpu::VertexBufferLayout` 的 lifetime 改为 `'static`，或者[使其成为 `const`](https://github.com/gfx-rs/wgpu/discussions/1790#discussioncomment-1160378)。示例如下：
    
```rust
impl Vertex {
    const ATTRIBS: [wgpu::VertexAttribute; 2] =
        wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3];

    fn desc<'a>() -> wgpu::VertexBufferLayout<'a> {
        use std::mem;

        wgpu::VertexBufferLayout {
            array_stride: mem::size_of::<Self>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &Self::ATTRIBS,
        }
    }
}
```

由于笔者认为现阶段最好直观地展示数据如何映射，所以这里暂时不会使用这个宏。

</div>

现在就可以在创建 `render_pipeline` 时配置好顶点缓冲区对应的描述符了：

```rust
let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
    // ...
    vertex: wgpu::VertexState {
        // ...
        buffers: &[
            Vertex::desc(),
        ],
    },
    // ...
});
```

还要注意一点：我们需要在 `render` 方法中实际设置好顶点缓冲区，否则程序会崩溃：

```rust
// render()
render_pass.set_pipeline(&self.render_pipeline);
// NEW!
render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
render_pass.draw(0..3, 0..1);
```

`set_vertex_buffer` 接受两个参数，第一个参数是这个顶点缓冲区对应的描述符索引，可以用它在多个顶点缓冲区之间切换。

第二个参数用于确定要使用缓冲区中的哪个片断。由于可以在硬件允许的前提下在一个缓冲区中存储尽可能多的对象，所以 `slice` 允许我们仅使用缓冲区中的一部分。这里我们用 `...` 来指定使用整个缓冲区。

在继续之前，我们应该稍加调整对 `render_pass.draw()` 的调用，以使用由 `VERTICES` 所确定的顶点数量。这需要在 `State` 中添加一个 `num_vertices`，并将其设置为等于 `VERTICES.len()` 即可：

```rust
// main.rs

struct State {
    // ...
    num_vertices: u32,
}

impl State {
    // ...
    fn new(...) -> Self {
        // ...
        let num_vertices = VERTICES.len() as u32;

        Self {
            surface,
            device,
            queue,
            config,
            render_pipeline,
            vertex_buffer,
            num_vertices,
            size,
        }
    }
}
```

然后就可以在绘制时传入它了：

```rust
// render
render_pass.draw(0..self.num_vertices, 0..1);
```

在我们的改变生效前，还需要继续更新顶点着色器，以便从顶点缓冲区中获取数据。并且还要让它能一并读取顶点的颜色：

```wgsl
// 顶点着色器

struct VertexInput {
    [[location(0)]] position: vec3<f32>;
    [[location(1)]] color: vec3<f32>;
};

struct VertexOutput {
    [[builtin(position)]] clip_position: vec4<f32>;
    [[location(0)]] color: vec3<f32>;
};

[[stage(vertex)]]
fn vs_main(
    model: VertexInput,
) -> VertexOutput {
    var out: VertexOutput;
    out.color = model.color;
    out.clip_position = vec4<f32>(model.position, 1.0);
    return out;
}

// 片元着色器

[[stage(fragment)]]
fn fs_main(in: VertexOutput) -> [[location(0)]] vec4<f32> {
    return vec4<f32>(in.color, 1.0);
}
```

如果这些都做对了，那么你应该能看到一个这样的三角形：

![A colorful triangle](./triangle.png)

## 索引缓冲区
就技术上而言，我们可以不*需要*索引缓冲区，但它们仍然很有用。当我们开始使用带有大量三角形的模型时，索引缓冲区就会发挥作用。例如对于如下所示的五边形：

![A pentagon made of 3 triangles](./pentagon.png)

它总共有 5 个顶点和 3 个三角形。现在如果我们想纯粹用顶点数据描述这个形状，那就需要形如以下的数据：

```rust
const VERTICES: &[Vertex] = &[
    Vertex { position: [-0.0868241, 0.49240386, 0.0], color: [0.5, 0.0, 0.5] }, // A
    Vertex { position: [-0.49513406, 0.06958647, 0.0], color: [0.5, 0.0, 0.5] }, // B
    Vertex { position: [0.44147372, 0.2347359, 0.0], color: [0.5, 0.0, 0.5] }, // E

    Vertex { position: [-0.49513406, 0.06958647, 0.0], color: [0.5, 0.0, 0.5] }, // B
    Vertex { position: [-0.21918549, -0.44939706, 0.0], color: [0.5, 0.0, 0.5] }, // C
    Vertex { position: [0.44147372, 0.2347359, 0.0], color: [0.5, 0.0, 0.5] }, // E

    Vertex { position: [-0.21918549, -0.44939706, 0.0], color: [0.5, 0.0, 0.5] }, // C
    Vertex { position: [0.35966998, -0.3473291, 0.0], color: [0.5, 0.0, 0.5] }, // D
    Vertex { position: [0.44147372, 0.2347359, 0.0], color: [0.5, 0.0, 0.5] }, // E
];
```

可以发现，其中有些顶点被使用了不止一次。例如 C 和 B 被使用了两次，而 E 被重复使用了 3 次。假设每个浮点数是 4 个字节，这就意味着我们在 `VERTICES` 中定义的 216 个字节中有多达 96 个是冗余的数据。如果能只把这些顶点列出来一次，那不是很好吗？所幸我们可以做到这一点! 这就是索引缓冲区发挥作用的地方了。

简单而言，我们在 `VERTICES` 中只需对每个顶点存储唯一的一份数据。然后我们可以创建另一个缓冲区，在其中存储对 `VERTICES` 中元素的索引，并据此来创建三角形。下面就是一个以此建模五边形的例子：

```rust
// main.rs
const VERTICES: &[Vertex] = &[
    Vertex { position: [-0.0868241, 0.49240386, 0.0], color: [0.5, 0.0, 0.5] }, // A
    Vertex { position: [-0.49513406, 0.06958647, 0.0], color: [0.5, 0.0, 0.5] }, // B
    Vertex { position: [-0.21918549, -0.44939706, 0.0], color: [0.5, 0.0, 0.5] }, // C
    Vertex { position: [0.35966998, -0.3473291, 0.0], color: [0.5, 0.0, 0.5] }, // D
    Vertex { position: [0.44147372, 0.2347359, 0.0], color: [0.5, 0.0, 0.5] }, // E
];

const INDICES: &[u16] = &[
    0, 1, 4,
    1, 2, 4,
    2, 3, 4,
];
```

在这种情况下，我们的 `VERTICES` 占用了大约 120 个字节，而 `INDICES` 只有 18 个字节（每个 `u16` 有 2 字节）。这时 wgpu 会自动增加 2 个字节的填充，以确保缓冲区长度能被对齐到 4 个字节，但就算这样 `INDICES` 也仍然只有 20 个字节。这样我们的五边形总共只需要 134 字节来表示，这意味着我们节约了 82 个字节! 这看起来可能不多，但当处理数以十万计的三角形时，索引机制就可以节省大量的内存。

为了使用索引，有几个需要改变的地方。首先我们需要创建一个用于存储索引的缓冲区。在 `State` 的 `new()` 方法中创建 `vertex_buffer` 之后，就需要创建出这个 `index_buffer`。同时还要将 `num_vertices` 改为 `num_indices`，并设置其值等于 `INDICES.len()`：

```rust
let vertex_buffer = device.create_buffer_init(
    &wgpu::util::BufferInitDescriptor {
        label: Some("Vertex Buffer"),
        contents: bytemuck::cast_slice(VERTICES),
        usage: wgpu::BufferUsages::VERTEX,
    }
);
// NEW!
let index_buffer = device.create_buffer_init(
    &wgpu::util::BufferInitDescriptor {
        label: Some("Index Buffer"),
        contents: bytemuck::cast_slice(INDICES),
        usage: wgpu::BufferUsages::INDEX,
    }
);
let num_indices = INDICES.len() as u32;
```

我们不需要为索引数组实现 `Pod` 和 `Zeroable`，因为 `bytemuck` 已经为 `u16` 这样的基本类型实现了它们。这意味着我们只需将 `index_buffer` 和`num_indices` 添加到 `State` struct 中即可：

```rust
struct State {
    surface: wgpu::Surface,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    size: winit::dpi::PhysicalSize<u32>,
    render_pipeline: wgpu::RenderPipeline,
    vertex_buffer: wgpu::Buffer,
    // NEW!
    index_buffer: wgpu::Buffer, 
    num_indices: u32,
}
```

然后就可以在构造函数中填充这些字段了：

```rust
Self {
    surface,
    device,
    queue,
    config,
    size,
    render_pipeline,
    vertex_buffer,
    // NEW!
    index_buffer,
    num_indices,
}
```

现在我们要做的就是更新 `render()` 方法以使用 `index_buffer`：

```rust
// render()
render_pass.set_pipeline(&self.render_pipeline);
render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
render_pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16); // 1.
render_pass.draw_indexed(0..self.num_indices, 0, 0..1); // 2.
```

这里有几件事需要注意。
1. 方法名是 `set_index_buffer` 而不是 `set_index_buffers`，每次只能设置一个索引缓冲区。
2. 当使用索引缓冲区时，需要使用 `draw_indexed`。之前的 `draw` 方法会忽略索引缓冲区。另外还需要确保这里使用的是索引数量（`num_indices`）而非顶点数量，否则要么会出现模型绘制问题，要么会因为没有足够的索引数而导致方法 `panic`。

完成这些之后，窗口里就应该有一个紫色的五边形了：

![Magenta pentagon in window](./indexed-pentagon.png)

## 颜色校正

如果你在现在的紫色五角星上使用取色器，你会得到约为 `#BC00BC` 的十六进制色值。如果继续将其转为 RGB 值，会得到 `(188, 0, 188)`。将这些值除以 255 以使其进入`[0, 1]` 范围后，我们大致会得到 `(0.737254902, 0.0, 0.737254902)`。这与我们为顶点颜色所赋的值有所不同，后者是 `(0.5, 0.0, 0.5)`。出现这一现象的原因与色彩空间有关。

大多数显示器使用的颜色空间是 sRGB。我们的 surface 一般使用 sRGB 纹理格式（这里很可能会使用从 `surface.get_preferred_format()` 返回的结果）。sRGB 格式是根据颜色的相对亮度而非实际亮度来存储的。这是因为人眼对光线的感知并非线性，在较深的颜色之间能感受到更多的差异。

你可以用这个公式得到对正确颜色的近似值：`srgb_color = (rgb_color / 255) ^ 2.2`。在 RGB 值为 `(188, 0, 188)` 的情况下，我们将获得 `(0.511397819, 0.0, 0.511397819)`。这与我们的 `(0.5, 0.0, 0.5)` 只有一点偏差。虽然你可以通过调整公式来获得所需的数值，但使用纹理可能会节省很多时间，因为它们默认就是按 sRGB 标准来存储的，所以不会像顶点颜色那样出现颜色不准确的情况。我们将在下一章节中介绍纹理。

## 小测验
不妨用一个顶点缓冲区和一个索引缓冲区创建一个比上面更复杂的形状（也就是超过三个三角形），并用空格键在这两者之间切换。

<AutoGithubLink/>
