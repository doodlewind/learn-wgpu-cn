# 介绍

## 什么是 Wgpu？
[Wgpu](https://github.com/gfx-rs/wgpu) 是 [WebGPU API 标准](https://gpuweb.github.io/gpuweb/)的 Rust 实现。WebGPU 是由 W3C GPU for the Web 社区小组所发布的规范，目标是让网页代码能安全可靠地访问 GPU 功能。其实现方式借鉴了 Vulkan API，会翻译到宿主硬件所用的各式 API（如 DirectX、Metal、Vulkan 等）上执行。

Wgpu 仍在开发中，故本文档中部分内容可能发生变化。

## 为什么使用 Rust？
Wgpu 实际上已经提供了 C 语言绑定，你既可以写 C/C++ 代码来使用它，也可以使用其他能与 C 互通的语言。尽管如此，wgpu 本身是用 Rust 实现的。因此它的 Rust 绑定较为方便，能帮助你减少编码时的阻碍。除此之外，笔者也一直在享受编写 Rust 的乐趣。

在学习本教程之前，你应该已经熟悉了 Rust，因为笔者不会对 Rust 的语法进行过多的详细介绍。如果你对 Rust 还不太熟悉，可以回顾一下 [Rust 教程](https://www.rust-lang.org/learn)。另外你也应该熟悉 [Cargo](https://doc.rust-lang.org/cargo)。

笔者自己在利用这个项目学习 wgpu，所以也可能会错过一些重要的细节，有些地方也可能解释得不够好。为此笔者始终愿意接受建设性的反馈。

## 贡献与支持

* 原版 [GitHub 仓库](https://github.com/sotrh/learn-wgpu)接受用于勘误性（如修复错别字、错误信息和其他不一致之处）的 PR。
* 由于 wgpu 的 API 变化很快，因此原版仓库不接受任何用于展示 demo 的 PR。
* 如果想直接支持原作者，请查看 [patreon](https://www.patreon.com/sotrh)！

## 特别致谢

*排名不分先后*

* Zeh Fernando
* The toddling chaos
* Jan Šipr
* Bernard Llanos
* Aron Granberg
* Ian Gowen
* Paul E Hansen
* Lennart
* Gunstein Vatnar
* David Laban
