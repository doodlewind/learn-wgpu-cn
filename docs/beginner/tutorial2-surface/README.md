# 使用 Surface

## 先做些整理：建模 State
为方便起见，我们将把所有的字段打包在一个 struct 内，并在其上添加一些方法：

```rust
// main.rs
use winit::window::Window;

struct State {
    surface: wgpu::Surface,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    size: winit::dpi::PhysicalSize<u32>,
}

impl State {
    // 某些 wgpu 类型需要使用异步代码才能创建
    async fn new(window: &Window) -> Self {
        todo!()
    }

    fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>) {
        todo!()
    }

    fn input(&mut self, event: &WindowEvent) -> bool {
        todo!()
    }

    fn update(&mut self) {
        todo!()
    }

    fn render(&mut self) -> Result<(), wgpu::SurfaceError> {
        todo!()
    }
}
```

此处会概述性介绍 `State` 下的字段。当后续章节中解释这些方法背后的代码时，它们的拆分会显得更加合理。

## State::new()
这部分代码非常直接，但我们可以对它进行一些拆解：

```rust
impl State {
    // ...
    async fn new(window: &Window) -> Self {
        let size = window.inner_size();

        // instance 变量是到 GPU 的 handle
        // Backends::all 对应 Vulkan + Metal + DX12 + 浏览器的 WebGPU
        let instance = wgpu::Instance::new(wgpu::Backends::all());
        let surface = unsafe { instance.create_surface(window) };
        let adapter = instance.request_adapter(
            &wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::default(),
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            },
        ).await.unwrap();
```

### Instance 与 Adapter

`instance` 是使用 wgpu 时所需创建的第一个实体，其主要用途是创建 `Adapter` 和 `Surface`。

`adapter`（适配器）是指向实际显卡的一个 handle。我们可以用它获取关于显卡的信息，例如显卡名称与其所适配到的后端等。稍后我们会用它来创建 `Device` 和 `Queue`。在此之前我们需要先讨论一下 `RequestAdapterOptions` 所涉及的字段。

* `power_preference` 参数有两个可选项：`LowPower` 和 `HighPerformance`。选择 `LowPower` 时将对应一个有利于电池续航的适配器（如集成显卡）。相应地，`HighPerformance` 对应的适配器将指向独立显卡这样更耗电但性能更强的 GPU。如果不存在符合 `HighPerformance` 选项的适配器，wgpu 将选择 `LowPower`。
* `compatible_surface` 字段要求 wgpu 所找到的适配器应当能与此处所传入的 surface 兼容。
* `force_fallback_adapter` 强制 wgpu 选择一个能在所有硬件上工作的适配器。这通常表明渲染后端将使用一个「软渲染」系统，而非 GPU 这样的硬件。

<div class="note">

此处我们传递给 `request_adapter` 的选项未必能对所有设备生效，但应当能在大多数设备上可用。如果 wgpu 找不到符合要求的适配器，`request_adapter` 将返回 `None`。如果你想获得某个特定后端所支持的全部适配器，可以使用 `enumerate_adapters`。它会返回一个迭代器，可以遍历检查其中是否存在符合要求 的适配器。

```rust
let adapter = instance
    .enumerate_adapters(wgpu::Backends::all())
    .filter(|adapter| {
        // 检查该适配器是否支持我们的 surface
        surface.get_preferred_format(&adapter).is_some()
    })
    .next()
    .unwrap()
```

还有一点值得注意：`Adapter` 是固定于某个特定后端的。如果你在 Windows 系统上有两块显卡，那么你至少就有 4 个适配器可以使用，其中两个支持 Vulkan，两个支持 DirectX。

如果想知道更多用于改进适配器搜索过程的字段，[请参见文档](https://docs.rs/wgpu/0.12.0/wgpu/struct.Adapter.html)。

</div>


### Surface

`surface` 是我们所绘制窗口的一部分，需要通过它来将内容上屏。为此我们的 `window` 需要实现 [raw-window-handle](https://crates.io/crates/raw-window-handle) 中的`HasRawWindowHandle` trait 来创建 surface。所幸 winit 的 `Window` 符合这个要求。另外我们还需要用 surface 来请求 `adapter`。

### Device 与 Queue
我们可以用 `adapter` 来创建 `device` 和 `queue`：

```rust
        let (device, queue) = adapter.request_device(
            &wgpu::DeviceDescriptor {
                features: wgpu::Features::empty(),
                limits: wgpu::Limits::default(),
                label: None,
            },
            None, // 是否追踪 API 调用路径
        ).await.unwrap();
```

`DeviceDescriptor` 上的 `features` 字段允许我们指定我们想要的额外特性。对现在这个简单的例子，我们不需要用到额外的特性。

<div class="note">

你的显卡会限制你可以使用的特性。如果你想使用某些高级特性，那可能需要限制应用所支持的设备，或实现变通方案。

你可以用 `adapter.features()` 或 `device.features()` 获得设备所支持特性的列表。可以在[这里](https://docs.rs/wgpu/0.12.0/wgpu/struct.Features.html)查看完整的特性列表。

</div>

`limits` 字段描述了对我们所能创建的某些资源类型的限制。我们将在本教程中使用默认值，这样可以支持大多数设备。可以在[这里](https://docs.rs/wgpu/0.12.0/wgpu/struct.Limits.html)查看详细的限制情况。

```rust
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface.get_preferred_format(&adapter).unwrap(),
            width: size.width,
            height: size.height,
            present_mode: wgpu::PresentMode::Fifo,
        };
        surface.configure(&device, &config);
```

这里我们要为 surface 定义一份配置，以此确定 surface 如何创建其底层的 `SurfaceTexture`。我们会等到后续介绍 `render` 函数时再讨论 `SurfaceTexture` 的问题。现在我们先来看看这份配置中的字段。

`usage` 字段用于定义应如何使用 `SurfaceTextures`。`RENDER_ATTACHMENT` 表明纹理将用来上屏（我们将在后面介绍其他的 `TextureUsage`）。

`format` 字段定义了 `SurfaceTexture` 在 GPU 上的存储方式。不同的显示器会偏好不同的格式。为此我们使用 `surface.get_preferred_format(&adapter)` 来基于当前显示器计算出对应的最佳格式。

`width` 和 `height` 是 `SurfaceTexture` 的宽度和高度（单位为像素）。它们通常应等于窗口的宽度和高度。

<div class="warning">
请确保 <code>SurfaceTexture</code> 的宽高不为 0，否则可能导致应用崩溃。
</div>

`present_mode` 使用 `wgpu::PresentMode` 枚举值来确定应如何将 surface 同步到显示器上。对于我们所选择的 `FIFO` 选项，其含义是将显示速率限制为显示器的帧速率。实际上这就是 VSync，也是移动设备上最理想的模式。对于其他选项可以[参见文档](https://docs.rs/wgpu/0.12.0/wgpu/enum.PresentMode.html)。

现在我们已经配置好了 surface，这样就可以在方法的末尾添加下面这些新字段了：

```rust
        Self {
            surface,
            device,
            queue,
            config,
            size,
        }
    }
    // ...
}
```

在进入事件循环前，我们需要在主方法中做如下调用：

```rust
// State::new 使用了异步代码，所以我们需等待其完成
let mut state = pollster::block_on(State::new(&window));
```

<div class="note">

你可以用形如 [async_std](https://docs.rs/async_std) 和 [tokio](https://docs.rs/tokio) 这样较重的库来让 main 函数支持异步，这样就可以 await 某个 future 了。笔者选择不使用这些库，是因为本教程并非涉及异步应用开发，并且由 wgpu 所创建的 future 无需[特殊执行器的支持](https://rust-lang.github.io/async-book/08_ecosystem/00_chapter.html#determining-ecosystem-compatibility)。因此我们只需要一些方法来与 wgpu 的异步函数进行交互，而 [pollster crate](https://docs.rs/pollster) 就足以满足这个需求了。

</div>

## resize()
如果想支持调整应用的窗口大小，我们需要在每次窗口尺寸改变时重新配置 `surface`。正因为如此，我们才同时存储了物理 `size` 和用于配置 `surface` 的 `config`。有了它们后，resize 方法的实现就非常简单了：

```rust
// impl State
pub fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>) {
    if new_size.width > 0 && new_size.height > 0 {
        self.size = new_size;
        self.config.width = new_size.width;
        self.config.height = new_size.height;
        self.surface.configure(&self.device, &self.config);
    }
}
```
上述代码与最初的 `surface` 配置过程没有实质性的差异，故此处不再赘述。

在 `main()` 函数的事件循环中，我们需要在以下事件发生时调用该方法：

```rust
match event {
    // ...

    } if window_id == window.id() => if !state.input(event) {
        match event {
            // ...

            WindowEvent::Resized(physical_size) => {
                state.resize(*physical_size);
            }
            WindowEvent::ScaleFactorChanged { new_inner_size, .. } => {
                // new_inner_size 是 &&mut 类型，因此需要解引用两次
                state.resize(**new_inner_size);
            }
            // ...
}
```

## input()

`input()` 返回一个 `bool` 来表示某事件是否已被完全处理。如果该方法返回 `true`，主循环将不再继续处理该事件。

由于目前还没有任何需要捕获的事件，现在我们只需在此返回 false 即可：

```rust
// impl State
fn input(&mut self, event: &WindowEvent) -> bool {
    false
}
```

另外我们还需要在事件循环中再多做一点工作。再加上之前的修改，最后的事件循环看起来应该像这样：

```rust
// main()
event_loop.run(move |event, _, control_flow| {
    match event {
        Event::WindowEvent {
            ref event,
            window_id,
        } if window_id == window.id() => if !state.input(event) { // UPDATED!
            match event {
                WindowEvent::CloseRequested
                | WindowEvent::KeyboardInput {
                    input:
                        KeyboardInput {
                            state: ElementState::Pressed,
                            virtual_keycode: Some(VirtualKeyCode::Escape),
                            ..
                        },
                    ..
                } => *control_flow = ControlFlow::Exit,
                WindowEvent::Resized(physical_size) => {
                    state.resize(*physical_size);
                }
                WindowEvent::ScaleFactorChanged { new_inner_size, .. } => {
                    state.resize(**new_inner_size);
                }
                _ => {}
            }
        }
        _ => {}
    }
});
```

## update()

我们还没有东西需要更新，所以在此留空即可：

```rust
fn update(&mut self) {
    // remove `todo!()`
}
```

到后续需要在各种对象之间跳转时，我们会在这里添加一些代码。

## render()

这里就是奇迹发生的地方了。首先我们需要获得一帧以供渲染：

```rust
// impl State

fn render(&mut self) -> Result<(), wgpu::SurfaceError> {
    let output = self.surface.get_current_texture()?;
```

`get_current_texture` 函数会等待 `surface` 提供一个新的 `SurfaceTexture` 以用于渲染。我们将把它储存在 `output` 中以便后续使用。

```rust
    let view = output.texture.create_view(&wgpu::TextureViewDescriptor::default());
```

这一行创建了一个使用默认配置的 `TextureView`，这样做是为了控制渲染代码与纹理之间的交互。

我们还需要创建一个 `CommandEncoder` 来创建实际发送到 GPU 上的命令。大多数现代图形框架会将发送到 GPU 之前的命令存储在一个命令缓冲区之中。`encoder` 就建立了一个这样的命令缓冲区，其中的数据可以发送给 GPU。

```rust
    let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("Render Encoder"),
    });
```

现在我们可以真正开始执行期盼已久的清屏操作了。我们需要使用 `encoder` 来创建 `RenderPass`。这个 `RenderPass` 拥有所有供实际绘图的方法。由于创建 `RenderPass` 的代码嵌套较深，所以在讨论其中细节之前，我们先把它完整地复制到这里：

```rust
    {
        let _render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("Render Pass"),
            color_attachments: &[wgpu::RenderPassColorAttachment {
                view: &view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color {
                        r: 0.1,
                        g: 0.2,
                        b: 0.3,
                        a: 1.0,
                    }),
                    store: true,
                },
            }],
            depth_stencil_attachment: None,
        });
    }

    // submit 方法能传入任何实现了 IntoIter 的参数
    self.queue.submit(std::iter::once(encoder.finish()));
    output.present();

    Ok(())
}
```

首先让我们看一下 `encoder.begin_render_pass(...)` 外部额外的块（`{}`）。由于 `begin_render_pass()` 是以可变方式借用了 `encoder`（又称 `&mut self`），因此在我们释放这个可变的借用之前，我们都不能调用 `encoder.finish()`。这个块告诉 rust 当代码离开其作用域时，释放其中的全部变量，从而释放 `encoder` 上的可变借用，从而使得我们能 `finish()` 它。如果你不喜欢 `{}`，你也可以使用 `drop(render_pass)` 来达到同样的效果。

我们也可以通过删除 `{}` 和 `let _render_pass =` 这一行来获得同样的效果，但我们在下一份教程中需要访问 `_render_pass`，所以在这里保持这个写法就可以了。

示例代码中的最后几行告诉 wgpu 结束对命令缓冲区的编码，并将其提交给 GPU 的渲染队列。

我们需要再次更新事件循环来调用 `render` 方法，注意在其之前应该先调用 `update`：

```rust
// main()
event_loop.run(move |event, _, control_flow| {
    match event {
        // ...
        Event::RedrawRequested(window_id) if window_id == window.id() => {
            state.update();
            match state.render() {
                Ok(_) => {}
                // 如果发生上下文丢失，就重新配置 surface
                Err(wgpu::SurfaceError::Lost) => state.resize(state.size),
                // 系统内存不足，此时应该退出
                Err(wgpu::SurfaceError::OutOfMemory) => *control_flow = ControlFlow::Exit,
                // 所有其他错误（如过时、超时等）都应在下一帧解决
                Err(e) => eprintln!("{:?}", e),
            }
        }
        Event::MainEventsCleared => {
            // 除非手动请求，否则 RedrawRequested 只会触发一次
            window.request_redraw();
        }
        // ...
    }
});
```

基于以上代码，你应该能获得类似这样的效果：

![带蓝色背景的窗口](./cleared-window.png)

## 关于 RenderPassDescriptor

一些读者可能光看一遍代码就能知道 RenderPassDescriptor 背后的细节，但如果笔者不把它介绍一遍，那就有些失职了。让我们再看一下代码：

```rust
&wgpu::RenderPassDescriptor {
    label: Some("Render Pass"),
    color_attachments: &[
        // ...
    ],
    depth_stencil_attachment: None,
}
```

一个 `RenderPassDescriptor` 只带有三个字段：`label`、`color_attachments` 和 `depth_stencil_attachment`。其中 `color_attachments` 定义了颜色所应绘制到的目标。此处我们传入之前创建的 `TextureView` 来确保渲染到屏幕上。

我们后面会用到 `depth_stencil_attachment`，但现在将其设置为 `None` 即可。

```rust
wgpu::RenderPassColorAttachment {
    view: &view,
    resolve_target: None,
    ops: wgpu::Operations {
        load: wgpu::LoadOp::Clear(wgpu::Color {
            r: 0.1,
            g: 0.2,
            b: 0.3,
            a: 1.0,
        }),
        store: true,
    },
}
```

`RenderPassColorAttachment` 有一个 `view` 字段，它用于告知 wgpu 应将颜色存储到哪个纹理。对现在的例子而言，这里应当传入我们用 `surface.get_current_texture()` 所创建的 `view`。这意味着后续在这个 attachment 上所绘制的颜色都会上屏。

`resolve_target` 是用于接收多重采样解析后所输出内容的纹理。除非启用了多重采样，否则这里获得的效果应当与 `view` 相同。我们无需进行这一配置，故将其保留为 `None` 即可。

`ops` 字段需要接收一个 `wpgu::Operations` 对象，它用于告知 wgpu 应如何处理屏幕上的颜色（此处由 `view` 确定）。`load` 字段告诉 wgpu 该如何处理存储在前一帧的颜色，对应到我们目前的设定，即为用蓝色清屏。`store` 字段用于告知 wgpu 是否应将渲染的结果存储到 `TextureView` 下层的 `Texture`（在这个例子中是 `SurfaceTexture`）。由于我们确实希望存储渲染结果，因此这里我们使用 `true`。有些时候是不需要这么做的。

<div class="note">

如果屏幕会被物体完全覆盖，那么不清屏的情况也是很常见的。但如果你的场景并未覆盖整个屏幕，那就需要用到上面这部分代码。

![./no-clear.png](./no-clear.png)

</div>

## 关于 Validation Error

如果 wgpu 在你的设备上使用 Vulkan，那么它可能在旧版 Vulkan SDK 上遇到 Validation Error。你应该至少使用 `1.2.182` 版本的 SDK，因为旧版可能产生一些误报。如果错误持续存在，也可能说明你遇到了 wgpu 的 bug。你可以在 [https://github.com/gfx-rs/wgpu](https://github.com/gfx-rs/wgpu) 提交相应的 issue。

## 小测验

修改 `input()` 方法来捕获鼠标事件，并使用该方法来更新清屏颜色。*提示：你可能需要使用 `WindowEvent::CursorMoved`*。

<AutoGithubLink/>
