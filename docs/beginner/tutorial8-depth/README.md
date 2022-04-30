# 深度缓冲区

让我们从一个特定的角度来仔细看看最后一个例子：

![depth_problems.png](./depth_problems.png)

本应在后面的模型被渲染到了本应在前面的模型之前，这是绘制顺序所导致的问题。默认情况下，来自新对象的像素数据将覆盖同位置的旧像素数据。

有两种方法来解决这个问题：要么将数据从后往前排序，要么使用深度缓冲区（depth buffer）。

## 从后向前排序

这是二维渲染中的常用方法，因为此时很容易直接基于 Z 轴顺序确定前后层级关系。但在三维渲染中，由于物体顺序会随相机角度变化而变化，所以处理起来会有点棘手。

一种简单的方法是直接按物体与摄像机之间距离来排序。但这种方法也有缺陷，因为当一个大物体在一个小物体后面时，大物体中本应在小物体前面的部分会被渲染到后面。我们也会遇到物体*本身*存在重叠时的问题。

因此如果想正确实现这一效果，就需要具备像素级的精度。这就是*深度缓冲区*的作用。

## 处理像素深度

深度缓冲区是一个黑白纹理，其中存储了已渲染像素的 Z 轴坐标。在绘制新像素时，wgpu 可以用它来决定是替换数据还是将其保留。这种技术就叫深度测试，它能解决我们的绘制顺序问题，还无需我们自己对物体排序!

让我们在 `texture.rs` 中增加一个函数来创建深度纹理：

```rust
impl Texture {
    pub const DEPTH_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float; // 1.
    
    pub fn create_depth_texture(device: &wgpu::Device, config: &wgpu::SurfaceConfiguration, label: &str) -> Self {
        let size = wgpu::Extent3d { // 2.
            width: config.width,
            height: config.height,
            depth_or_array_layers: 1,
        };
        let desc = wgpu::TextureDescriptor {
            label: Some(label),
            size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: Self::DEPTH_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT // 3.
                | wgpu::TextureUsages::TEXTURE_BINDING,
        };
        let texture = device.create_texture(&desc);

        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let sampler = device.create_sampler(
            &wgpu::SamplerDescriptor { // 4.
                address_mode_u: wgpu::AddressMode::ClampToEdge,
                address_mode_v: wgpu::AddressMode::ClampToEdge,
                address_mode_w: wgpu::AddressMode::ClampToEdge,
                mag_filter: wgpu::FilterMode::Linear,
                min_filter: wgpu::FilterMode::Linear,
                mipmap_filter: wgpu::FilterMode::Nearest,
                compare: Some(wgpu::CompareFunction::LessEqual), // 5.
                lod_min_clamp: -100.0,
                lod_max_clamp: 100.0,
                ..Default::default()
            }
        );

        Self { texture, view, sampler }
    }
}
```

1. 我们需要 `DEPTH_FORMAT` 来建立 `render_pipeline` 管线中的深度阶段，并创建深度纹理。
2. 如果想得到正确的渲染效果，深度纹理需要和屏幕一样大。我们可以用 `config` 来确保深度纹理与 surface 纹理的尺寸相同。
3. 由于我们要对这个纹理做渲染，因此需要给它添加 `RENDER_ATTACHMENT` 配置。
4. 从技术上而言，我们不*需要*深度纹理的采样器，但 `Texture` struct 需要它。并且如果我们想自己对深度纹理做采样，这时也会需要使用采样器。
5. 如果我们决定渲染深度纹理，需要使用 `CompareFunction::LessEqual`。这是由 `samplerShadow` 和 `sampler2DShadow()` 与 GLSL 中的 `texture()` 函数之间的关系所决定的。

我们在 `State::new()` 中来创建 `depth_texture`：

```rust
let depth_texture = texture::Texture::create_depth_texture(&device, &config, "depth_texture");
```

我们需要修改 `render_pipeline` 来启用深度测试：

```rust
let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
    // ...
    depth_stencil: Some(wgpu::DepthStencilState {
        format: texture::Texture::DEPTH_FORMAT,
        depth_write_enabled: true,
        depth_compare: wgpu::CompareFunction::Less, // 1.
        stencil: wgpu::StencilState::default(), // 2.
        bias: wgpu::DepthBiasState::default(),
    }),
    // ...
});
```

1. `depth_compare` 函数用于确定何时丢弃一个新像素，使用 `LESS` 意味着像素将从前往后绘制。下面是它所有的可选值：

```rust
#[repr(C)]
#[derive(Copy, Clone, Debug, Hash, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum CompareFunction {
    Undefined = 0,
    Never = 1,
    Less = 2,
    Equal = 3,
    LessEqual = 4,
    Greater = 5,
    NotEqual = 6,
    GreaterEqual = 7,
    Always = 8,
}
```

2. 还有一种缓冲区叫做模板缓冲区（stencil buffer），一般模板缓冲区和深度缓冲区会存储在同一个纹理中，相应字段用于控制模板测试。由于这里没有使用模板缓冲区，这里将使用默认值。我们将在[以后](../../todo)介绍模板缓冲区。

另外别忘了在 `State` 中存储 `depth_texture`：

```rust
Self {
    // ...
    depth_texture,
}
```

以及还要记得修改 `resize()` 方法，在其中创建一个新的 `depth_texture` 和 `depth_texture_view`：

```rust
fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>) {
    // ...

    self.depth_texture = texture::Texture::create_depth_texture(&self.device, &self.config, "depth_texture");

    // ...
}
```

请确保在更新 `config` *之后*再更新 `depth_texture`，否则会使得 `depth_texture` 与 `surface` 纹理的尺寸不同，进而导致程序崩溃。

我们最后需要修改的是 `render()` 函数。现在我们已经创建了 `depth_texture`，但还没有使用它。将它附加到 render pass 的 `depth_stencil_attachment` 中即可：

```rust
let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
    // ...
    depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
        view: &self.depth_texture.view,
        depth_ops: Some(wgpu::Operations {
            load: wgpu::LoadOp::Clear(1.0),
            store: true,
        }),
        stencil_ops: None,
    }),
});
```

这样就够了！不需要修改着色器代码！如果现在再运行应用，深度问题应该已经修复了。

![forest_fixed.png](./forest_fixed.png)

## 小测验

由于深度缓冲区是一个纹理，我们可以在着色器中对它采样。又因为它是一个深度纹理，我们必须用 `samplerShadow` uniform 类型和 `sampler2DShadow` 函数来代替 `sampler` 和 `sampler2D`。不妨尝试为深度纹理创建一个 bind group（或重用一个现有的），并将其渲染到屏幕上。

<AutoGithubLink/>
