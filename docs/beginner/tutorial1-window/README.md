# 依赖与窗口

## 是的，这段有些枯燥
有些读者应当已经非常熟悉如何在 Rust 中打开 GUI 窗口，也可能有自己最喜欢的窗口管理库。但本文档是为所有人设计的，所以这一部分也需要涉及。所幸你只要知道这是在做什么，就可以跳过本部分。只有一点值得了解，即无论你使用什么样的窗口解决方案，都需要支持 [raw-window-handle](https://github.com/rust-windowing/raw-window-handle) 这个 crate。

## 我们要使用哪些 crate?
我们将尽量保持入门部分的简单性。在后续深入时我们会逐渐添加依赖，但这里先列出了相关的 `Cargo.toml` 内容如下：

```toml
[dependencies]
image = "0.23"
winit = "0.26"
cgmath = "0.18"
env_logger = "0.9"
log = "0.4"
wgpu = "0.12"
pollster = "0.2"
```

## 使用 Rust 的新版特性解析器
自 0.10 版本起，wgpu 需要使用 cargo 的[新版特性解析器](https://doc.rust-lang.org/cargo/reference/resolver.html#feature-resolver-version-2)，这在 Rust 的 2021 edition（即任何基于 Rust 1.56.0 或更新版本的新项目）中是默认启用的。但如果你仍在使用 2018 edition 的 Rust，那么你需要在 `Cargo.toml` 的 `[package]` 段落添加 `resolver = "2"`，或在 workspace 的根级 `Cargo.toml` 的 `[workspace]` 段落加入这段配置。

## 关于 env_logger
通过 `env_logger::init()` 来启用日志是非常重要的。当 wgpu 遇到各类错误时，它都会用一条通用性的消息抛出 panic，并通过日志 crate 来记录真正的错误信息。这意味着如果不添加 `env_logger::init()`，wgpu 将静默地退出，从而使你非常困惑！

## 代码示例
这一部分没有太多特别之处，所以这里直接完整地贴出代码。只需将其粘贴到你的 `main.rs` 或类似位置即可：

```rust
use winit::{
    event::*,
    event_loop::{ControlFlow, EventLoop},
    window::WindowBuilder,
};

fn main() {
    env_logger::init();
    let event_loop = EventLoop::new();
    let window = WindowBuilder::new().build(&event_loop).unwrap();

    event_loop.run(move |event, _, control_flow| match event {
        Event::WindowEvent {
            ref event,
            window_id,
        } if window_id == window.id() => match event {
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
            _ => {}
        },
        _ => {}
    });
}

```

上述代码所做的全部工作不过是创建了一个窗口，并在用户关闭或按下 escape 键前使其保持打开。在下一篇教程中，我们将真正开始使用 wgpu!

<AutoGithubLink/>
