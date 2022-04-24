# 使用 Pipeline

## 什么是 Pipeline？
如果你熟悉 OpenGL，你可能还记得对着色器程序的使用。你可以认为 pipeline（管线）较其更为强大。一条 pipeline 描述了 GPU 在操作数据集时将执行的所有动作。在本节中，我们将具体创建一条 `RenderPipeline`。

## 什么是着色器？
着色器是发送到 GPU 上执行的小段程序，用于对数据进行操作（注意区分程序与数据，译者注）。着色器有三种主要类型：顶点着色器、片元着色器和计算着色器。另外还存在一些如几何着色器这样其他类型的着色器，但这已经属于较为进阶的话题。现在我们只需要使用顶点着色器和片元着色器。

## 什么是顶点和片元？
一个顶点（vertex）就是三维（或二维）空间中的一个点。这些顶点会两两成组以构成线段，或者三个一组以构成三角形。

<img src="./tutorial3-pipeline-vertices.png" />

大多数现代渲染系统使用三角形来建模所有形体。从简单如立方体到复杂如人体的结构，均可按此方式表达。这些三角形会被存储为一长串顶点，其中每个顶点均存储与某空间位置相关联的数据（注意顶点数据中未必仅有该点的坐标位置，译者注）。

<!-- Todo: Find/make an image to put here -->

我们需要先用顶点着色器来处理顶点，以便按我们的需求对形体做变换。

然后，顶点会被转换为片元（fragment）。渲染产物图像中的每个像素至少对应一个片元。每个片元都具备一个颜色，该颜色可被复制到其对应的像素。片元着色器可决定片元的颜色。

## WGSL

[WebGPU Shading Language](https://www.w3.org/TR/WGSL/)（WGSL）是 WebGPU 的着色器语言。WGSL 的开发重点是使其能轻松转换为与某渲染后端对应的着色器语言，如 Vulkan 的 SPIR-V、Metal 的 MSL、DX12 的 HLSL 和 OpenGL 的 GLSL 等。这些转换是在内部完成的，我们通常不需要关心这些细节。对 wgpu 而言，这一过程是由名为 [naga](https://github.com/gfx-rs/naga) 的库完成的。

注意在本文写作时，一些 WebGPU 实现也支持 SPIR-V，但这只是向 WGSL 过渡期间的临时性措施，其支持最终将被移除（如果你对 SPIR-V 和 WGSL 背后的八卦感到好奇，请参考[这篇博文](http://kvark.github.io/spirv/2021/05/01/spirv-horrors.html)）。

<div class="note">

如果你曾阅读过本教程，你可能会注意到笔者已从 GLSL 迁移到 WGSL。鉴于标准对 GLSL 的支持较为次要，而 WGSL 才是 WGPU 的一等公民语言，故笔者选择将所有教程均迁移到使用 WGSL。仓库中一些展示性的 demo 仍会使用 GLSL，但主要教程和所有的配套示例都将使用 WGSL。

</div>

<div class="note">

WGSL 规范及其在 WGPU 中的应用仍在开发之中。如果你在使用时遇到问题，或许可以在 [https://app.element.io/#/room/#wgpu:matrix.org](https://app.element.io/#/room/#wgpu:matrix.org) 请社区参与者们看一下你的代码。

</div>

## 编写着色器
首先在与 `main.rs` 同级的目录中创建一个 `shader.wgsl` 文件，在其中写入以下代码：

```wgsl
// 顶点着色器

struct VertexOutput {
    [[builtin(position)]] clip_position: vec4<f32>;
};

[[stage(vertex)]]
fn vs_main(
    [[builtin(vertex_index)]] in_vertex_index: u32,
) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(1 - i32(in_vertex_index)) * 0.5;
    let y = f32(i32(in_vertex_index & 1u) * 2 - 1) * 0.5;
    out.clip_position = vec4<f32>(x, y, 0.0, 1.0);
    return out;
}
```

我们先声明了 `struct` 来存储顶点着色器的输出，其中目前只有一个字段，即顶点的 `clip_position`。`[[builtin(position)]]` 这段标记告诉 wgpu，这个值应当作为顶点在[剪切坐标系](https://en.wikipedia.org/wiki/Clip_coordinates)中的位置来使用，类似于 GLSL 的 `gl_Position` 变量。

<div class="note">

WGSL 中形如 `vec4` 的矢量类型是泛型。目前你必须指定矢量内部值的具体类型。因此，一个使用 32 位浮点数的三维向量对应 `vec3<f32>`。

</div>

着色器代码的下一部分是 `vs_main` 函数。我们用 `[[stage(vertex)]]` 将这个函数标记为顶点着色器的有效入口。它需要传入一个名为 `in_vertex_index` 的 `u32` 参数，而这个参数会从 `[[builtin(vertex_index)]]` 处取值。

然后我们用 `VertexOutput` struct 定义了一个名为 `out` 的变量，还为三角形的 `x` 和 `y` 创建了另外两个变量。

<div class="note">

此处的 `f32()` 和 `i32()` 代码是显式类型转换（cast）的例子。

</div>

<div class="note">

用 `var` 定义的变量可以被修改，但必须指定其类型。用 `let` 创建的变量可以推断出它们的类型，但在着色器中不能改变它们的值。

</div>

现在我们可以把 `clip_position` 保存到 `out` 了。然后只要返回 `out`，我们就完成了顶点着色器的工作！

<div class="note">

就技术上而言，这个例子中也可以不使用 struct，直接做如下操作即可：

```wgsl
[[stage(vertex)]]
fn vs_main(
    [[builtin(vertex_index)]] in_vertex_index: u32
) -> [[builtin(position)]] vec4<f32> {
    // 顶点着色器代码...
}
```

不过我们后面会为 `VertexOutput` 添加更多的字段，所以不妨从现在就开始使用它。

</div>

接下来是片元着色器了。继续在 `shader.wgsl` 中加入以下内容即可：

```wgsl
// 片元着色器

[[stage(fragment)]]
fn fs_main(in: VertexOutput) -> [[location(0)]] vec4<f32> {
    return vec4<f32>(0.3, 0.2, 0.1, 1.0);
}
```

这会将当前片元的颜色设置为棕色。

<div class="note">

注意顶点着色器的入口点被命名为 `vs_main`，而片元着色器的入口点被称为 `fs_main`。在 wgpu 的早期版本中，这两个函数可以采用相同的名称，但较新版本的 [WGSL 规范](https://www.w3.org/TR/WGSL/#declaration-and-scope)要求它们使用不同的名称。因此，上面提到的命名方案（该方案也在 wgpu 自身示例中应用）将在整个教程中应用。

</div>

`[[location(0)]` 标记会告知 wgpu 将该函数返回的 `vec4` 值存储在其第一个颜色目标中。后面我们会介绍其详细含义。

## 如何使用着色器？
这里终于用到了本节标题中提到的 pipeline 概念。我们首先需要修改 `State` 来加入以下字段：

```rust
// main.rs
struct State {
    surface: wgpu::Surface,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    size: winit::dpi::PhysicalSize<u32>,
    // NEW!
    render_pipeline: wgpu::RenderPipeline,
}
```

现在我们看一下 `new()` 方法，可以在此开始构建 pipeline。为此我们需要先载入前面写好的着色器，它们是 `render_pipeline` 所需要的：

```rust
let shader = device.create_shader_module(&wgpu::ShaderModuleDescriptor {
    label: Some("Shader"),
    source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()),
});
```

<div class="note">

你也可以把 `include_wgsl!` 宏作为创建 `ShaderModuleDescriptor` 的一条小捷径：

```rust
let shader = device.create_shader_module(&include_wgsl!("shader.wgsl"));
```

</div>

另外我们还需要创建一个 `PipelineLayout`。在介绍完 `Buffer` 之后，我们会对这个概念有更多的了解：

```rust
let render_pipeline_layout =
    device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("Render Pipeline Layout"),
        bind_group_layouts: &[],
        push_constant_ranges: &[],
    });
```

最后我们就获得了创建 `render_pipeline` 所需的全部内容：

```rust
let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
    label: Some("Render Pipeline"),
    layout: Some(&render_pipeline_layout),
    vertex: wgpu::VertexState {
        module: &shader,
        entry_point: "vs_main", // 1.
        buffers: &[], // 2.
    },
    fragment: Some(wgpu::FragmentState { // 3.
        module: &shader,
        entry_point: "fs_main",
        targets: &[wgpu::ColorTargetState { // 4.
            format: config.format,
            blend: Some(wgpu::BlendState::REPLACE),
            write_mask: wgpu::ColorWrites::ALL,
        }],
    }),
    // continued ...
```

这里有几点值得注意：
1. 我们可以在此指定应将着色器中的哪个函数作为 `entry_point`。它们分别对应着色器中用 `[[stage(vertex)]]` 和 `[[stage(fragment)]` 标记的函数。
2. `buffers` 字段用于告知 wgpu 我们要传递给顶点着色器的顶点类型。由于我们会直接在顶点着色器中指定顶点，因此在此留空。下一篇教程中会涉及更多这部分内容。
3. `fragment` 就技术上而言是可选的，所以必须将其包装在 `Some()` 中。如果想将颜色数据存储到 `surface`，那么就需要使用它。
4. `targets` 字段告诉 wgpu 应该设置哪些颜色输出。目前我们只需为 `surface` 设置单个输出。这里使用 `surface` 的格式配置以便复制，并且指定混合模式（blending）为仅用新数据替换旧像素数据。此外我们还要求 wgpu 写入所有像素通道的颜色，即红、蓝、绿和 alpha。我们将在讨论纹理时更多地介绍 `color_state`。

```rust
    primitive: wgpu::PrimitiveState {
        topology: wgpu::PrimitiveTopology::TriangleList, // 1.
        strip_index_format: None,
        front_face: wgpu::FrontFace::Ccw, // 2.
        cull_mode: Some(wgpu::Face::Back),
        // 如果将该字段设置为除了 Fill 之外的任何值，都需要 Features::NON_FILL_POLYGON_MODE
        polygon_mode: wgpu::PolygonMode::Fill,
        // 需要 Features::DEPTH_CLIP_ENABLE
        unclipped_depth: false,
        // 需要 Features::CONSERVATIVE_RASTERIZATION
        conservative: false,
    },
    // continued ...
```

`primitive` 字段描述了应如何将我们所提供的顶点数据转为三角形：

1. `PrimitiveTopology::TriangleList` 表示每三个顶点将对应一个三角形。
2. `front_face` 和 `cull_mode` 字段告诉 wgpu 应如何确定某个三角形是否朝前。`FrontFace::Ccw` 表示如果顶点按逆时针方向排列，则判定三角形是朝前的。不满足朝前条件的三角形会被剔除（即不被渲染），这是用 `CullMode::Back` 所确定的。我们将在讨论 `Buffer` 时进一步介绍剔除问题。

```rust
    depth_stencil: None, // 1.
    multisample: wgpu::MultisampleState {
        count: 1, // 2.
        mask: !0, // 3.
        alpha_to_coverage_enabled: false, // 4.
    },
    multiview: None, // 5.
});
```

这个方法中的剩余部分相当简单：
1. 我们目前没有使用深度 / 模板缓冲区，所以这里把 `depth_stencil` 设为 `None`。*这一点在后面会有所变化*。
2. `count` 决定了 pipeline 将使用多少次采样。多采样是个复杂的话题，不会在这里展开讨论。
3. `mask` 指定了哪些采样应被设为活跃。目前我们将使用所有的采样。
4. `alpha_to_coverage_enabled` 与抗锯齿有关。这里尚不涉及抗锯齿，所以现在将其设置为 false。
5. `multiview` 用于表示渲染 attachment 中可以带有多少个 [array layer](https://www.w3.org/TR/webgpu/#array-layer)。我们不会对纹理阵列做渲染，所以可以将其设置为 `None`。

<!-- https://gamedev.stackexchange.com/questions/22507/what-is-the-alphatocoverage-blend-state-useful-for -->

现在我们只要把 `render_pipeline` 添加到 `State`中就可以了!

```rust
// new()
Self {
    surface,
    device,
    queue,
    config,
    size,
    // NEW!
    render_pipeline,
}
```
## 使用 Pipeline

如果你现在运行起程序，会发现它虽然有更长的启动时间，但仍然会显示在上一节中得到的蓝屏效果。这是因为虽然我们创建了 `render_pipeline`，但还需要修改 `render()` 中的代码才能实际使用它：

```rust
// render()

// ...
{
    // 1.
    let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("Render Pass"),
        color_attachments: &[
            // 这就是片元着色器中 [[location(0)]] 对应的目标
            wgpu::RenderPassColorAttachment {
                view: &view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(
                        wgpu::Color {
                            r: 0.1,
                            g: 0.2,
                            b: 0.3,
                            a: 1.0,
                        }
                    ),
                    store: true,
                }
            }
        ],
        depth_stencil_attachment: None,
    });

    // NEW!
    render_pass.set_pipeline(&self.render_pipeline); // 2.
    render_pass.draw(0..3, 0..1); // 3.
}
// ...
```

这部分没有多少变化，但这里还是简单介绍下我们的改动：
1. 我们把 `_render_pass` 重命名为了 `render_pass`，并将其设置为 mutable 变量。
2. 我们在 `render_pass` 上设置了刚创建出的 pipeline。
3. 我们告诉 wgpu 用 3 个顶点和 1 个实例来做绘制，这就是 `[[builtin(vertex_index)]]` 的数据来源（即未对顶点着色器传入三角形各点坐标，仅根据 0 1 2 的数组下标索引各自计算出了三角形各点位置，译者注）。

有了这些之后，你应该就能看到一个可爱的棕色三角形了：

![Said lovely brown triangle](./tutorial3-pipeline-triangle.png)


## 小测验
创建第二个 pipeline，在其中用三角形的位置数据创建出一种颜色，并将其发送给片元着色器。当按下空格键时，让程序在这些 pipeline 之间做切换。*提示：这需要修改 `VertexOutput`*。

<AutoGithubLink/>
