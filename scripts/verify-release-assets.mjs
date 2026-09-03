import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const publicRoot = path.join(projectRoot, "public");
const buildRoot = path.join(publicRoot, "build");
const errors = [];
const warnings = [];

const requiredPublicAssets = [
    "ubsc-blue.svg",
    "assets/brand/ubsc-logo-640.webp",
    "assets/hero/Bottom-poster.jpg",
    "assets/reels/hero.mp4",
    "assets/reels/hero-h264.mp4",
    "assets/reels/Footer.mp4",
    "assets/reels/Footer-h264.mp4",
];

function reportError(message) {
    errors.push(message);
}

function reportWarning(message) {
    warnings.push(message);
}

function verifyExactCase(relativePath) {
    const segments = relativePath.split("/");
    let currentDirectory = publicRoot;

    for (const segment of segments) {
        if (!fs.existsSync(currentDirectory)) {
            reportError(`Direktori induk tidak ditemukan untuk public/${relativePath}.`);
            return;
        }

        const entries = fs.readdirSync(currentDirectory);
        if (!entries.includes(segment)) {
            const caseInsensitiveMatch = entries.find(
                (entry) => entry.toLocaleLowerCase("en-US") === segment.toLocaleLowerCase("en-US"),
            );

            if (caseInsensitiveMatch) {
                reportError(
                    `Kapitalisasi aset salah: public/${relativePath} memakai "${caseInsensitiveMatch}" pada disk.`,
                );
            } else {
                reportError(`Aset wajib hilang: public/${relativePath}.`);
            }
            return;
        }

        currentDirectory = path.join(currentDirectory, segment);
    }

    const stats = fs.statSync(currentDirectory);
    if (!stats.isFile() || stats.size === 0) {
        reportError(`Aset wajib kosong atau bukan file: public/${relativePath}.`);
    }
}

function verifyManifest() {
    const manifestPath = path.join(buildRoot, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
        reportError("Vite manifest hilang: public/build/manifest.json.");
        return;
    }

    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (error) {
        reportError(`Vite manifest tidak valid: ${error.message}`);
        return;
    }

    const outputFiles = new Set();
    for (const entry of Object.values(manifest)) {
        if (typeof entry?.file === "string") {
            outputFiles.add(entry.file);
        }
        for (const key of ["css", "assets"]) {
            if (Array.isArray(entry?.[key])) {
                for (const file of entry[key]) {
                    if (typeof file === "string") {
                        outputFiles.add(file);
                    }
                }
            }
        }
    }

    if (outputFiles.size === 0) {
        reportError("Vite manifest tidak memiliki output file.");
        return;
    }

    for (const outputFile of outputFiles) {
        const normalized = outputFile.replaceAll("/", path.sep);
        const absolutePath = path.join(buildRoot, normalized);
        if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
            reportError(`Output yang tercantum di manifest hilang: public/build/${outputFile}.`);
        }
    }

    const requiredEntries = ["resources/js/app.tsx", "resources/js/Pages/HomePage.tsx"];
    for (const entry of requiredEntries) {
        if (!manifest[entry]) {
            reportError(`Entry penting tidak tercantum di Vite manifest: ${entry}.`);
        }
    }
}

function inspectMp4(
    relativePath,
    { requireH264 = false, requireFastStart = false } = {},
) {
    const absolutePath = path.join(publicRoot, relativePath.replaceAll("/", path.sep));
    if (!fs.existsSync(absolutePath)) {
        return;
    }

    const bytes = fs.readFileSync(absolutePath);
    const signature = bytes.toString("latin1");
    const hasH264 = signature.includes("avc1");
    const moovOffset = signature.indexOf("moov");
    const mdatOffset = signature.indexOf("mdat");

    if (requireH264 && !hasH264) {
        reportError(
            `public/${relativePath} bukan fallback H.264 (signature avc1 tidak ditemukan).`,
        );
    }

    if (
        requireFastStart &&
        moovOffset !== -1 &&
        mdatOffset !== -1 &&
        moovOffset > mdatOffset
    ) {
        reportError(
            `public/${relativePath} belum fast-start (atom moov berada setelah mdat); playback jaringan dapat terlambat.`,
        );
    }
}

for (const asset of requiredPublicAssets) {
    verifyExactCase(asset);
}

verifyManifest();
inspectMp4("assets/reels/hero-h264.mp4", {
    requireH264: true,
    requireFastStart: true,
});
inspectMp4("assets/reels/Footer-h264.mp4", {
    requireH264: true,
    requireFastStart: true,
});

if (fs.existsSync(path.join(publicRoot, "hot"))) {
    reportError("public/hot masih ada; production akan mencoba memuat Vite development server.");
}

for (const warning of warnings) {
    console.warn(`[release-assets:warning] ${warning}`);
}

if (errors.length > 0) {
    for (const error of errors) {
        console.error(`[release-assets:error] ${error}`);
    }
    process.exit(1);
}

console.log(
    `[release-assets] OK: ${requiredPublicAssets.length} aset publik dan ${path.relative(projectRoot, buildRoot)} tervalidasi.`,
);
