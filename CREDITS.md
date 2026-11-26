# Credits

- Avatars (`public/models/avatars/*.vrm`): **100 Avatars** by Polygonal Mind — CC0 1.0.
  Source registry: https://github.com/toxsam/open-source-avatars
  The performer body is the "Bruno" avatar; its original head is hidden and replaced (`src/performer.ts`).
- Performer heads and bodies (`public/models/performer-*.glb` = Post Malone, `dt-*.glb` = Don Toliver): fan-art caricatures.
  Reference images generated with OpenAI `gpt-image-2`; 3D meshes and textures generated from them with
  Microsoft TRELLIS (MIT license) via the Hugging Face demo. The face front additionally blends the reference image
  (`performer-head-front.jpg`, `dt-head-front.jpg`) projected from the front (`src/performer-head-model.ts`).
  Body bone weights are transferred in code from the CC0 "Bruno" avatar's nearest vertices (`src/performer-body-model.ts`).
- No photos, audio, lyrics or logos of the artist are included (the head is AI-generated fan art, not a photo). Songs are referenced by title only.

This is an unofficial fan project, not affiliated with the artist or the promoter.
