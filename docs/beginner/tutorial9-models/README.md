# 加载模型

到目前为止，我们一直在手动创建模型。虽然这也可行，但如果想处理有大量多边形的复杂模型，这样做的效率会非常低。正因为如此，我们需要修改代码来支持 obj 模型格式，这样就可以在诸如 blender 这样的软件中创建模型，并在我们的应用中显示了。

由于现在的 `main.rs` 文件已经有些杂乱，我们可以再创建一个 `model.rs` 文件，在此放置用于加载模型的代码：

```rust
// model.rs
pub trait Vertex {
    fn desc<'a>() -> wgpu::VertexBufferLayout<'a>;
}

#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct ModelVertex {
    position: [f32; 3],
    tex_coords: [f32; 2],
    normal: [f32; 3],
}

impl Vertex for ModelVertex {
    fn desc<'a>() -> wgpu::VertexBufferLayout<'a> {
        todo!();
    }
}
```

可以注意到这里有几个重点。首先在 `main.rs` 中我们将 `Vertex` 建模成了一个 struct，而这里使用的则是一个 trait，以便支持多种顶点类型（如模型、用户界面、实例数据等）。将 `Vertex` 建模为 trait 也使我们能抽离出 `VertexBufferLayout` 创建部分的代码，从而简化 `RenderPipeline` 的创建。

另一个重点是 `ModelVertex` 中的 `normal` 字段。在讨论光照问题前我们还不会使用这个字段，但现在我们会先把它添加到 struct 中。

下面让我们来定义 `VertexBufferLayout`：

```rust
impl Vertex for ModelVertex {
    fn desc<'a>() -> wgpu::VertexBufferLayout<'a> {
        use std::mem;
        wgpu::VertexBufferLayout {
            array_stride: mem::size_of::<ModelVertex>() as wgpu::BufferAddress,
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
                    format: wgpu::VertexFormat::Float32x2,
                },
                wgpu::VertexAttribute {
                    offset: mem::size_of::<[f32; 5]>() as wgpu::BufferAddress,
                    shader_location: 2,
                    format: wgpu::VertexFormat::Float32x3,
                },
            ],
        }
    }
}
```

这部分代码基本上与原来的 `VertexBufferLayout` 相同，但我们为 `normal` 增加了一个 `VertexAttribute`。另外也可以删除 `main.rs` 中的 `Vertex` struct，因为它也已经用不到了。在 `RenderPipeline` 中，也应当使用从模型中所获得的新 `Vertex`：

```rust
let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
    // ...
    vertex: wgpu::VertexState {
        // ...
        buffers: &[model::ModelVertex::desc(), InstanceRaw::desc()],
    },
    // ...
});
```

由于 `desc` 方法是在 `Vertex` trait 上实现的，因此在访问该方法前需导入该 trait。为此只需将导入的内容放在代码文件顶部即可：

```rust
use model::Vertex;
```

在此之后，我们需要一个用于渲染的模型。如果你手头已经有了模型那自然很好。如果还没有，这里也提供了一个带有模型及其中所有纹理的 [zip 文件](https://github.com/sotrh/learn-wgpu/blob/master/code/beginner/tutorial9-models/res/cube.zip)。我们将这个模型放在与现有 `src` 目录相邻的一个新 `res` 目录中。

## 从资源目录中获取文件

当 cargo 构建并运行程序时，它会设置一个当前工作目录。这个目录通常是放置了项目根目录下 `Cargo.toml` 的目录。我们资源目录所在的路径也可能有所不同，这取决于项目的结构。本节教程示例代码的 `res` 目录位于 `code/beginner/tutorial9-models/res/`。当加载模型时可以使用这个路径，只需附加上 `cube.obj` 即可。这样确实可用，但如果我们改变项目目录结构，就会使代码不可用。

我们将通过修改构建脚本来解决这个问题。只需将 `res` 目录复制到 cargo 创建可执行文件的位置，然后再从那里引用资源即可。为此可以创建一个名为 `build.rs` 的文件，添加以下内容：

```rust
use anyhow::*;
use fs_extra::copy_items;
use fs_extra::dir::CopyOptions;
use std::env;

fn main() -> Result<()> {
    // 这里告诉 cargo 如果 /res/ 目录中的任何内容发生了变化，就重新运行脚本
    println!("cargo:rerun-if-changed=res/*");

    let out_dir = env::var("OUT_DIR")?;
    let mut copy_options = CopyOptions::new();
    copy_options.overwrite = true;
    let mut paths_to_copy = Vec::new();
    paths_to_copy.push("res/");
    copy_items(&paths_to_copy, out_dir, &copy_options)?;

    Ok(())
}
```

<div class="note">

请确保将 `build.rs` 放在与 `Cargo.toml` 相同的目录中。否则在 crate 构建时 cargo 不会运行构建脚本。

</div>

<div class="note">

`OUT_DIR` 是一个环境变量，cargo 用它来指定应用构建产物的输出位置。

</div>

另外还要修改 `Cargo.toml` 来让上述改动能正常工作。为此需在 `[dependencies]` 位置添加以下内容：

```toml
[build-dependencies]
anyhow = "1.0"
fs_extra = "1.2"
glob = "0.3"
```


## 使用 TOBJ 加载模型

我们将用 [tobj](https://docs.rs/tobj/3.0/tobj/) 库来加载模型。首先将其添加到 `Cargo.toml` 中：

```toml
[dependencies]
# other dependencies...
tobj = "3.0"
```

不过在能加载模型前，我们还需要能在代码中放下它：

```rust
// model.rs
pub struct Model {
    pub meshes: Vec<Mesh>,
    pub materials: Vec<Material>,
}
```

可以注意到我们的 `Model` struct 中分别有一个用于 `meshes`（网格）和 `materials`（材质）的 `Vec`。这一点很重要，因为 obj 文件中可以包含多份网格和材质。然后我们仍然需要创建 `Mesh` 和 `Material` 类，像这样：

```rust
pub struct Material {
    pub name: String,
    pub diffuse_texture: texture::Texture,
    pub bind_group: wgpu::BindGroup,
}

pub struct Mesh {
    pub name: String,
    pub vertex_buffer: wgpu::Buffer,
    pub index_buffer: wgpu::Buffer,
    pub num_elements: u32,
    pub material: usize,
}
```

`Material` 相当简单，其中只有一个名称字段和一个纹理字段。我们的立方体 obj 文件中实际上有 2 个纹理，但其中一个是法线贴图，我们将在[后面](../../intermediate/tutorial11-normals)对其作介绍。名称字段更多是为了调试而加入的。

说到纹理，我们需要为 `texture.rs` 中的 `Texture` 添加一个 `load()` 方法：

```rust
use std::path::Path;

pub fn load<P: AsRef<Path>>(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    path: P,
) -> Result<Self> {
    // 需要这样处理来满足 borrow checker
    let path_copy = path.as_ref().to_path_buf();
    let label = path_copy.to_str();
    
    let img = image::open(path)?;
    Self::from_image(device, queue, &img, label)
}
```

在为模型加载纹理时，`load` 方法会非常有用。这是因为 `include_bytes!` 要求我们在编译时知道文件名，但我们对模型纹理并不能真正保证这一点。

既然如此，我们也可以在 `model.rs` 中导入 `texture.rs`：

```rust
use crate::texture;
```

我们还需要对 `texture.rs` 中的 `from_image()` 方法做一点细微的改动。由于 PNG 图像有 alpha 通道，它们在 `as_rgba8()` 时运行良好。但 JPEG 图像没有 alpha 通道，如果我们试图在要使用的 JPEG 纹理图像上调用 `as_rgba8()`，代码就会出问题。不过相反地，我们可以使用 `to_rgba8()` 来处理这样的图像。这样即使原始图像没有 alpha 通道，这个 API 也会生成一个新的图像缓冲区：

```rust
let rgba = img.to_rgba8(); 
```

由于 `rgba` 现在是一个新的图像缓冲区，而不是对原始图像缓冲区的引用，因此当后面调用 `write_texture` 时，需要以引用形式来传递它：

```rust
    //...
    &rgba,  // UPDATED!
    wgpu::ImageDataLayout {
```

`Mesh` 中持有一个顶点缓冲区、一个索引缓冲区，以及网格中的索引数。我们使用一个 `usize` 来表示材质，这个 `usize` 将在绘制时用于索引 `materials` 列表：

完成这些之后，就可以开始加载模型了：

```rust
impl Model {
    pub fn load<P: AsRef<Path>>(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        layout: &wgpu::BindGroupLayout,
        path: P,
    ) -> Result<Self> {
        let (obj_models, obj_materials) = tobj::load_obj(path.as_ref(), &LoadOptions {
                triangulate: true,
                single_index: true,
                ..Default::default()
            },
        )?;

        let obj_materials = obj_materials?;

        // 我们假设纹理文件是和 obj 文件一起存储的
        let containing_folder = path.as_ref().parent()
            .context("Directory has no parent")?;

        let mut materials = Vec::new();
        for mat in obj_materials {
            let diffuse_path = mat.diffuse_texture;
            let diffuse_texture = texture::Texture::load(device, queue, containing_folder.join(diffuse_path))?;

            let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&diffuse_texture.view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&diffuse_texture.sampler),
                    },
                ],
                label: None,
            });

            materials.push(Material {
                name: mat.name,
                diffuse_texture,
                bind_group,
            });
        }

        let mut meshes = Vec::new();
        for m in obj_models {
            let mut vertices = Vec::new();
            for i in 0..m.mesh.positions.len() / 3 {
                vertices.push(ModelVertex {
                    position: [
                        m.mesh.positions[i * 3],
                        m.mesh.positions[i * 3 + 1],
                        m.mesh.positions[i * 3 + 2],
                    ],
                    tex_coords: [m.mesh.texcoords[i * 2], m.mesh.texcoords[i * 2 + 1]],
                    normal: [
                        m.mesh.normals[i * 3],
                        m.mesh.normals[i * 3 + 1],
                        m.mesh.normals[i * 3 + 2],
                    ],
                });
            }

            let vertex_buffer = device.create_buffer_init(
                &wgpu::util::BufferInitDescriptor {
                    label: Some(&format!("{:?} Vertex Buffer", path.as_ref())),
                    contents: bytemuck::cast_slice(&vertices),
                    usage: wgpu::BufferUsages::VERTEX,
                }
            );
            let index_buffer = device.create_buffer_init(
                &wgpu::util::BufferInitDescriptor {
                    label: Some(&format!("{:?} Index Buffer", path.as_ref())),
                    contents: bytemuck::cast_slice(&m.mesh.indices),
                    usage: wgpu::BufferUsages::INDEX,
                }
            );

            meshes.push(Mesh {
                name: m.name,
                vertex_buffer,
                index_buffer,
                num_elements: m.mesh.indices.len() as u32,
                material: m.mesh.material_id.unwrap_or(0),
            });
        }

        Ok(Self { meshes, materials })
    }
}
```

## 渲染网格

在能够绘制模型前，我们需要能绘制一份独立的网格。为此可创建一个名为 `DrawModel` 的 trait，并为 `RenderPass` 实现它：

```rust
pub trait DrawModel<'a> {
    fn draw_mesh(&mut self, mesh: &'a Mesh);
    fn draw_mesh_instanced(
        &mut self,
        mesh: &'a Mesh,
        instances: Range<u32>,
    );
}
impl<'a, 'b> DrawModel<'b> for wgpu::RenderPass<'a>
where
    'b: 'a,
{
    fn draw_mesh(&mut self, mesh: &'b Mesh) {
        self.draw_mesh_instanced(mesh, 0..1);
    }

    fn draw_mesh_instanced(
        &mut self,
        mesh: &'b Mesh,
        instances: Range<u32>,
    ){
        self.set_vertex_buffer(0, mesh.vertex_buffer.slice(..));
        self.set_index_buffer(mesh.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
        self.draw_indexed(0..mesh.num_elements, 0, instances);
    }
}
```

我们也可以把这些方法放在 `impl Model` 中，但笔者认为让 `RenderPass` 做所有的渲染更加合理，因为这就是它的职责。这样就意味着我们在渲染时必须导入 `DrawModel`：

```rust
// main.rs
render_pass.set_vertex_buffer(1, self.instance_buffer.slice(..));
render_pass.set_pipeline(&self.render_pipeline);
render_pass.set_bind_group(0, &self.diffuse_bind_group, &[]);
render_pass.set_bind_group(1, &self.camera_bind_group, &[]);

use model::DrawModel;
render_pass.draw_mesh_instanced(&self.obj_model.meshes[0], 0..self.instances.len() as u32);
```

但在此之前，我们需要实际加载模型并将其保存到 `State`。为此可在 `State::new()` 中加入以下内容：

```rust
let res_dir = std::path::Path::new(env!("OUT_DIR")).join("res");
let obj_model = model::Model::load(
    &device,
    &queue,
    &texture_bind_group_layout,
    res_dir.join("cube.obj"),
).unwrap();
```

<div class="note">

这里我们用 `OUT_DIR` 来获取 `res` 目录路径。

</div>

我们的新模型比之前的模型还要大一些，所以我们需要调整一下实例之间的间距：

```rust
const SPACE_BETWEEN: f32 = 3.0;
let instances = (0..NUM_INSTANCES_PER_ROW).flat_map(|z| {
    (0..NUM_INSTANCES_PER_ROW).map(move |x| {
        let x = SPACE_BETWEEN * (x as f32 - NUM_INSTANCES_PER_ROW as f32 / 2.0);
        let z = SPACE_BETWEEN * (z as f32 - NUM_INSTANCES_PER_ROW as f32 / 2.0);

        let position = cgmath::Vector3 { x, y: 0.0, z };

        let rotation = if position.is_zero() {
            cgmath::Quaternion::from_axis_angle(cgmath::Vector3::unit_z(), cgmath::Deg(0.0))
        } else {
            cgmath::Quaternion::from_axis_angle(position.normalize(), cgmath::Deg(45.0))
        };

        Instance {
            position, rotation,
        }
    })
}).collect::<Vec<_>>();
```

完成后应该获得这样的效果：

![cubes.png](./cubes.png)

## 使用正确纹理

如果你检查一下 obj 对应的纹理文件，你会发现它们与原始 obj 文件并不匹配。我们想看到的纹理是这样的：

![cube-diffuse.jpg](./cube-diffuse.jpg)

但我们得到的仍然是快乐小树的纹理。

这个问题的原因很简单，是因为尽管我们已经创建了纹理，但还没有创建一个 bind group 给到 `RenderPass`。我们仍然在使用旧的 `diffuse_bind_group`。如果想改变这一点，就要使用我们材质的 bind group，即 `Material` struct 下的 `bind_group` 成员。

我们先要给 `DrawModel` 添加一个材质参数。

```rust
pub trait DrawModel<'a> {
    fn draw_mesh(&mut self, mesh: &'a Mesh, material: &'a Material, camera_bind_group: &'a wgpu::BindGroup);
    fn draw_mesh_instanced(
        &mut self,
        mesh: &'a Mesh,
        material: &'a Material,
        instances: Range<u32>,
        camera_bind_group: &'a wgpu::BindGroup,
    );

}

impl<'a, 'b> DrawModel<'b> for wgpu::RenderPass<'a>
where
    'b: 'a,
{
    fn draw_mesh(&mut self, mesh: &'b Mesh, material: &'b Material, camera_bind_group: &'b wgpu::BindGroup) {
        self.draw_mesh_instanced(mesh, material, 0..1, camera_bind_group);
    }

    fn draw_mesh_instanced(
        &mut self,
        mesh: &'b Mesh,
        material: &'b Material,
        instances: Range<u32>,
        camera_bind_group: &'b wgpu::BindGroup,
    ) {
        self.set_vertex_buffer(0, mesh.vertex_buffer.slice(..));
        self.set_index_buffer(mesh.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
        self.set_bind_group(0, &material.bind_group, &[]);
        self.set_bind_group(1, camera_bind_group, &[]);
        self.draw_indexed(0..mesh.num_elements, 0, instances);
    }
}
```

然后还需要修改渲染代码以使其生效：

```rust
render_pass.set_vertex_buffer(1, self.instance_buffer.slice(..));

render_pass.set_pipeline(&self.render_pipeline);

let mesh = &self.obj_model.meshes[0];
let material = &self.obj_model.materials[mesh.material];
render_pass.draw_mesh_instanced(mesh, material, 0..self.instances.len() as u32, &self.camera_bind_group);
```

在此基础上，我们应该能获得以下效果：

![cubes-correct.png](./cubes-correct.png)

## 渲染完整模型

现在我们直接指定好了网格和材质，这在想用不同的材质来绘制网格时会很有用。另外如果模型由多个部分组成，我们还不能渲染出模型的其他部分。为此可在 `DrawModel` 上创建一个方法，其中可按模型中各部分的材质来对其做绘制：

```rust
pub trait DrawModel<'a> {
    // ...
    fn draw_model(&mut self, model: &'a Model, camera_bind_group: &'a wgpu::BindGroup);
    fn draw_model_instanced(
        &mut self,
        model: &'a Model,
        instances: Range<u32>,
        camera_bind_group: &'a wgpu::BindGroup,
    );
}

impl<'a, 'b> DrawModel<'b> for wgpu::RenderPass<'a>
where
    'b: 'a, {
    // ...
    fn draw_model(&mut self, model: &'b Model, camera_bind_group: &'b wgpu::BindGroup) {
        self.draw_model_instanced(model, 0..1, camera_bind_group);
    }

    fn draw_model_instanced(
        &mut self,
        model: &'b Model,
        instances: Range<u32>,
        camera_bind_group: &'b wgpu::BindGroup,
    ) {
        for mesh in &model.meshes {
            let material = &model.materials[mesh.material];
            self.draw_mesh_instanced(mesh, material, instances.clone(), camera_bind_group);
        }
    }
}
```

`main.rs` 中代码也需要相应的改变：

```rust
render_pass.set_vertex_buffer(1, self.instance_buffer.slice(..));
render_pass.set_pipeline(&self.render_pipeline);
render_pass.draw_model_instanced(&self.obj_model, 0..self.instances.len() as u32, &self.camera_bind_group);
```

<AutoGithubLink/>
