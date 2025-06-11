# Patches Directory

This directory contains Git patch files that modify third-party dependencies. These patches are typically applied using `patch-package` during the `postinstall` script.

## Patch Files

1. **3dmloader.patch** - Modifications to 3D model loading functionality
2. **demuxer-mp4.patch** - Changes to MP4 demuxer behavior
3. **jolt-physics.patch** - Customizations to Jolt Physics engine
4. **xr-controller-model-factory.patch** - VR controller model factory adjustments
5. **xr-hand-mesh-model.patch** - VR hand mesh model customizations

## How to Apply Patches

Patches are automatically applied after `npm install` if you have `patch-package` installed. To apply manually:

```bash
npx patch-package
```

## Adding New Patches

1. Make your changes to the files in `node_modules`
2. Run:
   ```bash
   npx patch-package <package-name>
   ```
3. Commit the new patch file to version control

## Dependencies

- patch-package (devDependency)
- postinstall-postinstall (for Yarn compatibility)
