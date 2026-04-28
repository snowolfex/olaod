# 2026-04-28 Operator Platform Wave

## Highlights

- Unified OL branding across the app, help surfaces, public assets, and installer outputs.
- Added installer inventory tracking plus cleaner uninstall behavior for Windows and Linux.
- Added GitHub-release based update publishing support with signed manifest delivery.
- Expanded the AI workspace with tool execution, reusable knowledge bases, retrieval debugging, vector-map inspection, and richer chat wiring.
- Tightened Help/manual guidance, including deeper operator explanations and improved PDF export layout.

## Installer and update work

- Windows and Linux installers now record managed install paths so uninstall can remove what Oload installed without guessing.
- Linux launcher creation and cleanup now follow the recorded install manifest.
- Update bundles can be published through GitHub Releases and mirrored through GitHub Pages with manifest signing support.

## Product and operator workflow

- Access now exposes clearer update posture, provider state, and knowledge-base setup guidance.
- Chat gained reusable knowledge-base bindings, built-in tool toggles, attachment retrieval, and transcript-level tool-call visibility.
- Help/manual content now provides a deeper operator explanation layer alongside the existing technical and plain-language sections.

## Validation snapshot

- Lint completed cleanly after the latest warning cleanup.
- Recent installer, branding, and AI workspace work has been pushed on `main`.