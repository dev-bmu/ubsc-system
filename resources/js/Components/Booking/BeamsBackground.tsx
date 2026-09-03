import { useEffect, useRef } from "react";
import {
    Box,
    Camera,
    Mesh,
    Program,
    Renderer,
    Transform,
    type OGLRenderingContext,
} from "ogl";

interface BeamsBackgroundProps {
    beamColor?: string;
    backgroundColor?: string;
    speed?: number;
    className?: string;
}

interface PanelConfig {
    scale: [number, number, number];
    position: [number, number, number];
    rotation: [number, number, number];
    opacity: number;
    roughness: number;
    tone: number;
    edgeGlow: number;
    sweepStrength: number;
    swayAmount: number;
    swaySpeed: number;
    swayPhase: number;
    mobileVisible: boolean;
}

const PANELS: PanelConfig[] = [
    {
        scale: [0.92, 7.8, 0.38],
        position: [-3.12, 0.1, -0.5],
        rotation: [-0.025, 0.56, -0.16],
        opacity: 1,
        roughness: 0.18,
        tone: 1,
        edgeGlow: 0.48,
        sweepStrength: 0.92,
        swayAmount: 0.009,
        swaySpeed: 0.2,
        swayPhase: 0,
        mobileVisible: true,
    },
    {
        scale: [0.78, 7.25, 0.34],
        position: [3.16, -0.12, -0.9],
        rotation: [0.028, -0.52, 0.13],
        opacity: 1,
        roughness: 0.2,
        tone: 0.9,
        edgeGlow: 0.5,
        sweepStrength: 0.86,
        swayAmount: 0.008,
        swaySpeed: 0.18,
        swayPhase: 1.4,
        mobileVisible: true,
    },
    {
        scale: [6.8, 0.4, 0.38],
        position: [-0.12, -2.14, -1.75],
        rotation: [-0.055, 0.08, 0.042],
        opacity: 0.9,
        roughness: 0.22,
        tone: 0.7,
        edgeGlow: 0.38,
        sweepStrength: 0.56,
        swayAmount: 0.005,
        swaySpeed: 0.13,
        swayPhase: 3.8,
        mobileVisible: false,
    },
    {
        scale: [0.52, 7.05, 0.28],
        position: [-1.98, -0.2, -2.55],
        rotation: [-0.015, 0.34, -0.125],
        opacity: 0.88,
        roughness: 0.24,
        tone: 0.66,
        edgeGlow: 0.3,
        sweepStrength: 0.62,
        swayAmount: 0.007,
        swaySpeed: 0.12,
        swayPhase: 4.7,
        mobileVisible: true,
    },
    {
        scale: [0.47, 6.75, 0.26],
        position: [2.05, 0.12, -2.8],
        rotation: [0.018, -0.31, 0.105],
        opacity: 0.86,
        roughness: 0.25,
        tone: 0.62,
        edgeGlow: 0.32,
        sweepStrength: 0.58,
        swayAmount: 0.006,
        swaySpeed: 0.11,
        swayPhase: 5.9,
        mobileVisible: true,
    },
    {
        scale: [0.32, 6.2, 0.2],
        position: [-1.14, 0.02, -4.7],
        rotation: [0.01, 0.19, -0.15],
        opacity: 0.66,
        roughness: 0.3,
        tone: 0.48,
        edgeGlow: 0.22,
        sweepStrength: 0.42,
        swayAmount: 0.005,
        swaySpeed: 0.09,
        swayPhase: 7.1,
        mobileVisible: false,
    },
    {
        scale: [0.3, 6.35, 0.2],
        position: [1.2, -0.14, -4.95],
        rotation: [-0.012, -0.2, 0.135],
        opacity: 0.62,
        roughness: 0.31,
        tone: 0.46,
        edgeGlow: 0.2,
        sweepStrength: 0.38,
        swayAmount: 0.004,
        swaySpeed: 0.08,
        swayPhase: 8.4,
        mobileVisible: false,
    },
];

const VERTEX = /* glsl */ `
    precision highp float;

    attribute vec3 position;
    attribute vec3 normal;

    uniform mat4 modelMatrix;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    uniform mat3 normalMatrix;

    varying vec3 vLocalPos;
    varying vec3 vWorldPos;
    varying vec3 vViewPos;
    varying vec3 vNormal;

    void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vec4 viewPos = modelViewMatrix * vec4(position, 1.0);

        vLocalPos = position;
        vWorldPos = worldPos.xyz;
        vViewPos = viewPos.xyz;
        vNormal = normalize(normalMatrix * normal);

        gl_Position = projectionMatrix * viewPos;
    }
`;

const createFragment = (octaves: number) => /* glsl */ `
    precision highp float;

    uniform vec3 uSubstrate;
    uniform vec3 uAccent;
    uniform vec3 uSilver;
    uniform float uTime;
    uniform float uOpacity;
    uniform float uRoughness;
    uniform float uEdgeGlow;
    uniform float uSweepStrength;
    uniform float uPanelIndex;

    varying vec3 vLocalPos;
    varying vec3 vWorldPos;
    varying vec3 vViewPos;
    varying vec3 vNormal;

    float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
    }

    float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);

        return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), u.x),
            u.y
        );
    }

    float brushedFbm(vec2 p) {
        float result = 0.0;
        float amplitude = 0.5;
        mat2 rotation = mat2(0.86, 0.5, -0.5, 0.86);

        for (int i = 0; i < ${octaves}; i++) {
            result += valueNoise(p) * amplitude;
            p = rotation * p * 2.04 + 17.0;
            amplitude *= 0.5;
        }

        return result;
    }

    void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(-vViewPos);

        float brush = brushedFbm(
            vec2(vLocalPos.y * 22.0, vLocalPos.x * 4.0) +
            vec2(uPanelIndex * 8.13, uPanelIndex * 2.47)
        );
        float grooves = sin((vLocalPos.y + uPanelIndex * 0.137) * 430.0) * 0.5 + 0.5;
        float roughness = clamp(
            uRoughness + (brush - 0.5) * 0.052 + (grooves - 0.5) * 0.014,
            0.08,
            0.58
        );

        vec3 keyLight = normalize(vec3(0.36, 0.72, 0.62));
        vec3 fillLight = normalize(vec3(-0.72, -0.18, 0.66));
        float keyDiffuse = max(dot(N, keyLight), 0.0);
        float fillDiffuse = max(dot(N, fillLight), 0.0);

        vec3 keyHalf = normalize(keyLight + V);
        vec3 fillHalf = normalize(fillLight + V);
        float specularPower = mix(175.0, 24.0, roughness);
        float keySpecular = pow(max(dot(N, keyHalf), 0.0), specularPower);
        float fillSpecular = pow(max(dot(N, fillHalf), 0.0), specularPower * 0.62);

        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);

        float sweepCenter = sin(uTime * 0.46 + uPanelIndex * 1.73) * 0.62;
        float sweepDistance = abs(vLocalPos.y + vLocalPos.x * 0.38 - sweepCenter);
        float sweep = 1.0 - smoothstep(0.025, 0.2, sweepDistance);
        sweep *= sweep;
        float broadSweep = 1.0 - smoothstep(0.12, 0.68, sweepDistance);
        broadSweep *= broadSweep;

        vec2 localEdge = abs(vLocalPos.xy) * 2.0;
        float edge = max(
            smoothstep(0.91, 0.995, localEdge.x),
            smoothstep(0.925, 0.995, localEdge.y)
        );

        float worldVariation = valueNoise(vWorldPos.xy * 0.72 + uPanelIndex * 3.0);
        float diffuse = keyDiffuse * 0.72 + fillDiffuse * 0.24;

        vec3 color = uSubstrate * (0.2 + diffuse * 0.58);
        color += uSilver * (0.022 + diffuse * 0.078) *
            (0.72 + uSweepStrength * 0.28);
        color += uAccent * (keyDiffuse * 0.1 + fillDiffuse * 0.04);
        color += uSilver * (keySpecular * 1.95 + fillSpecular * 0.58) *
            (0.82 + brush * 0.18);
        color += uSilver * sweep * uSweepStrength * (0.25 + keyDiffuse * 0.56);
        color += uSilver * broadSweep * uSweepStrength * 0.105;
        color += uAccent * edge * uEdgeGlow * (0.42 + fresnel * 0.88);
        color += uAccent * fresnel * 0.19;
        color *= 0.91 + worldVariation * 0.09;

        float distanceToCamera = length(vViewPos);
        float fog = smoothstep(7.0, 13.5, distanceToCamera);
        color = mix(color, vec3(0.003, 0.008, 0.011), fog * 0.88);

        color = color / (vec3(1.0) + color * 0.58);
        gl_FragColor = vec4(color, uOpacity);
    }
`;

const hexToVec3 = (hex: string): [number, number, number] => {
    const normalized = hex.replace("#", "").padEnd(6, "0").slice(0, 6);

    return [
        parseInt(normalized.slice(0, 2), 16) / 255,
        parseInt(normalized.slice(2, 4), 16) / 255,
        parseInt(normalized.slice(4, 6), 16) / 255,
    ];
};

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

export default function BeamsBackground({
    beamColor = "#15678D",
    backgroundColor = "#010203",
    speed = 0.55,
    className = "",
}: BeamsBackgroundProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const motionQuery = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        );
        const coarsePointerQuery = window.matchMedia(
            "(hover: none) and (pointer: coarse)",
        );
        const userAgent = navigator.userAgent;
        const isIOSDevice =
            /iP(?:hone|ad|od)/.test(userAgent) ||
            (navigator.platform === "MacIntel" &&
                navigator.maxTouchPoints > 1);
        const suppressHeightOnlyResize =
            isIOSDevice || coarsePointerQuery.matches;
        const readDeviceOrientation = (): "portrait" | "landscape" => {
            const orientationType = window.screen.orientation?.type;

            if (orientationType?.startsWith("landscape")) return "landscape";
            if (orientationType?.startsWith("portrait")) return "portrait";

            return window.screen.width > window.screen.height
                ? "landscape"
                : "portrait";
        };
        const initialMobile = container.clientWidth <= 640;
        const initialDpr = initialMobile
            ? 1
            : Math.min(window.devicePixelRatio || 1, 1.5);

        let renderer: Renderer;

        try {
            renderer = new Renderer({
                width: Math.max(container.clientWidth, 1),
                height: Math.max(container.clientHeight, 1),
                dpr: initialDpr,
                antialias: !initialMobile && !motionQuery.matches,
                alpha: false,
                depth: true,
                powerPreference: initialMobile
                    ? "low-power"
                    : "high-performance",
            });
        } catch {
            container.dataset.beamsFallback = "true";
            return;
        }

        const gl: OGLRenderingContext = renderer.gl;
        const background = hexToVec3(backgroundColor);
        gl.clearColor(background[0], background[1], background[2], 1);
        container.appendChild(gl.canvas);

        const cameraTarget: [number, number, number] = [0, -0.18, -2.4];
        const camera = new Camera(gl, {
            fov: initialMobile ? 42 : 38,
            near: 0.1,
            far: 40,
        });
        camera.position.set(0, 0.08, 6.2);
        camera.lookAt(cameraTarget);

        const scene = new Transform();
        const geometry = new Box(gl, {
            width: 1,
            height: 1,
            depth: 1,
        });
        const accent = hexToVec3(beamColor);
        const silver: [number, number, number] = [
            0.76 + accent[0] * 0.08,
            0.82 + accent[1] * 0.06,
            0.84 + accent[2] * 0.06,
        ];
        const fragment = createFragment(initialMobile ? 2 : 3);
        const programs: Program[] = [];
        const panels: Array<{
            mesh: Mesh;
            config: PanelConfig;
            basePosition: [number, number, number];
            baseRotation: [number, number, number];
        }> = [];

        PANELS.forEach((config, index) => {
            const substrate: [number, number, number] = [
                (0.017 + accent[0] * 0.105) * config.tone,
                (0.024 + accent[1] * 0.105) * config.tone,
                (0.03 + accent[2] * 0.105) * config.tone,
            ];
            const program = new Program(gl, {
                vertex: VERTEX,
                fragment,
                uniforms: {
                    uSubstrate: { value: substrate },
                    uAccent: { value: accent },
                    uSilver: { value: silver },
                    uTime: { value: 0 },
                    uOpacity: { value: config.opacity },
                    uRoughness: { value: config.roughness },
                    uEdgeGlow: { value: config.edgeGlow },
                    uSweepStrength: { value: config.sweepStrength },
                    uPanelIndex: { value: index + 1 },
                },
                transparent: config.opacity < 1,
                cullFace: gl.BACK,
                depthTest: true,
                depthWrite: true,
            });
            const mesh = new Mesh(gl, { geometry, program });

            mesh.scale.set(...config.scale);
            mesh.position.set(...config.position);
            mesh.rotation.set(...config.rotation);
            mesh.setParent(scene);

            programs.push(program);
            panels.push({
                mesh,
                config,
                basePosition: [...config.position],
                baseRotation: [...config.rotation],
            });
        });

        if (
            programs.some(
                (program) =>
                    !gl.getProgramParameter(program.program, gl.LINK_STATUS),
            )
        ) {
            programs.forEach((program) => program.remove());
            geometry.remove();
            container.removeChild(gl.canvas);
            container.dataset.beamsFallback = "true";
            gl.getExtension("WEBGL_lose_context")?.loseContext();
            return;
        }

        let animationFrame = 0;
        let resizeFrame = 0;
        let viewportFrame = 0;
        let lastFrame = -Infinity;
        let frameInterval = initialMobile ? 1000 / 30 : 1000 / 60;
        let inViewport = true;
        let pageVisible = !document.hidden;
        let reducedMotion = motionQuery.matches;
        let contextLost = false;
        let currentWidth = 0;
        let currentHeight = 0;
        let currentDpr = 0;
        let currentOrientation: "portrait" | "landscape" | null = null;
        const startTime = performance.now();
        const pointer = { x: 0, y: 0 };
        const pointerTarget = { x: 0, y: 0 };
        const renderOptions = {
            scene,
            camera,
            sort: true,
            frustumCull: false,
        };

        const shouldAnimate = () =>
            inViewport && pageVisible && !reducedMotion && !contextLost;

        const updateScene = (timestamp: number) => {
            const elapsed = Math.max(timestamp - startTime, 0) * 0.001 * speed;

            pointer.x += (pointerTarget.x - pointer.x) * 0.028;
            pointer.y += (pointerTarget.y - pointer.y) * 0.028;

            scene.rotation.set(
                pointer.y * -0.012,
                pointer.x * 0.028 + Math.sin(elapsed * 0.09) * 0.01,
                0,
            );

            const cameraX = pointer.x * 0.13;
            const cameraY = 0.08 + pointer.y * 0.065;
            if (camera.position.x !== cameraX || camera.position.y !== cameraY) {
                camera.position.x = cameraX;
                camera.position.y = cameraY;
                camera.lookAt(cameraTarget);
            }

            for (let index = 0; index < panels.length; index += 1) {
                const { mesh, config, basePosition, baseRotation } = panels[index];
                if (!mesh.visible) continue;
                const phase = elapsed * config.swaySpeed + config.swayPhase;

                mesh.rotation.set(
                    baseRotation[0] +
                        Math.sin(phase * 0.81) * config.swayAmount,
                    baseRotation[1] +
                        Math.cos(phase) * config.swayAmount * 1.15,
                    baseRotation[2] +
                        Math.sin(phase * 0.56 + 0.7) *
                            config.swayAmount *
                            0.5,
                );
                mesh.position.x =
                    basePosition[0] + Math.sin(phase * 0.34) * config.swayAmount * 2;
                mesh.position.y =
                    basePosition[1] + Math.cos(phase * 0.42) * config.swayAmount * 1.6;
                programTime(mesh.program, elapsed + index * 0.045);
            }
        };

        const renderFrame = (timestamp: number) => {
            updateScene(reducedMotion ? startTime : timestamp);
            renderer.render(renderOptions);
            if (container.dataset.beamsReady !== "true") {
                container.dataset.beamsReady = "true";
            }
        };

        const queueAnimation = () => {
            if (animationFrame || !shouldAnimate()) return;
            animationFrame = requestAnimationFrame(tick);
        };

        const tick = (timestamp: number) => {
            animationFrame = 0;
            if (!shouldAnimate()) return;

            if (timestamp - lastFrame >= frameInterval) {
                renderFrame(timestamp);
                lastFrame = timestamp;
            }

            queueAnimation();
        };

        const syncAnimation = () => {
            if (shouldAnimate()) {
                queueAnimation();
                return;
            }

            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
                animationFrame = 0;
            }
        };

        const resize = () => {
            resizeFrame = 0;
            const width = Math.max(Math.round(container.clientWidth), 1);
            const height = Math.max(Math.round(container.clientHeight), 1);
            const mobile = width <= 640;
            const dpr = mobile
                ? 1
                : Math.min(window.devicePixelRatio || 1, width <= 1024 ? 1.25 : 1.5);
            const orientation = readDeviceOrientation();

            if (
                suppressHeightOnlyResize &&
                currentWidth > 0 &&
                width === currentWidth &&
                dpr === currentDpr &&
                orientation === currentOrientation
            ) {
                return;
            }

            if (
                width === currentWidth &&
                height === currentHeight &&
                dpr === currentDpr &&
                orientation === currentOrientation
            ) {
                return;
            }

            currentWidth = width;
            currentHeight = height;
            currentDpr = dpr;
            currentOrientation = orientation;
            frameInterval = width <= 1024 ? 1000 / 30 : 1000 / 60;

            renderer.dpr = dpr;
            renderer.setSize(width, height);
            camera.perspective({
                aspect: width / height,
                fov: mobile ? 42 : 38,
                near: 0.1,
                far: 40,
            });

            const horizontalScale = clamp(width / height / 1.7, 0.55, 1.55);
            scene.scale.set(horizontalScale, mobile ? 0.92 : 1, 1);
            panels.forEach(({ mesh, config }) => {
                const visible = !mobile || config.mobileVisible;
                mesh.visible = visible;
                mesh.matrixAutoUpdate = visible;
            });

            renderFrame(performance.now());
        };

        const scheduleResize = () => {
            if (resizeFrame) return;
            resizeFrame = requestAnimationFrame(resize);
        };

        const handlePointerMove = (event: PointerEvent) => {
            if (reducedMotion || event.pointerType === "touch") return;
            pointerTarget.x = clamp((event.clientX / window.innerWidth - 0.5) * 2, -1, 1);
            pointerTarget.y = clamp((event.clientY / window.innerHeight - 0.5) * 2, -1, 1);
        };

        const handlePointerLeave = () => {
            pointerTarget.x = 0;
            pointerTarget.y = 0;
        };

        const handleVisibility = () => {
            pageVisible = !document.hidden;
            syncAnimation();
        };

        const handleMotionPreference = (event: MediaQueryListEvent) => {
            reducedMotion = event.matches;
            if (reducedMotion) renderFrame(startTime);
            syncAnimation();
        };

        const handleContextLost = (event: Event) => {
            event.preventDefault();
            contextLost = true;
            delete container.dataset.beamsReady;
            container.dataset.beamsFallback = "true";
            gl.canvas.style.display = "none";
            syncAnimation();
        };

        const resizeObserver =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(scheduleResize);
        resizeObserver?.observe(container);
        if (!resizeObserver) {
            window.addEventListener("resize", scheduleResize, { passive: true });
        }

        const checkViewport = () => {
            viewportFrame = 0;
            const rect = container.getBoundingClientRect();
            inViewport =
                rect.bottom >= -100 && rect.top <= window.innerHeight + 100;
            syncAnimation();
        };
        const scheduleViewportCheck = () => {
            if (viewportFrame) return;
            viewportFrame = requestAnimationFrame(checkViewport);
        };
        const intersectionObserver =
            typeof IntersectionObserver === "undefined"
                ? null
                : new IntersectionObserver(
                      ([entry]) => {
                          inViewport = entry?.isIntersecting ?? false;
                          syncAnimation();
                      },
                      { threshold: 0.01, rootMargin: "100px 0px" },
                  );
        intersectionObserver?.observe(container);
        if (!intersectionObserver) {
            window.addEventListener("scroll", scheduleViewportCheck, {
                passive: true,
            });
            window.addEventListener("resize", scheduleViewportCheck, {
                passive: true,
            });
            scheduleViewportCheck();
        }

        const supportsMotionChangeEvent =
            typeof motionQuery.addEventListener === "function";

        document.addEventListener("visibilitychange", handleVisibility);
        window.addEventListener("pointermove", handlePointerMove, { passive: true });
        window.addEventListener("pointerleave", handlePointerLeave);
        if (supportsMotionChangeEvent) {
            motionQuery.addEventListener("change", handleMotionPreference);
        } else {
            motionQuery.addListener(handleMotionPreference);
        }
        gl.canvas.addEventListener("webglcontextlost", handleContextLost);

        resize();
        syncAnimation();

        return () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
            if (resizeFrame) cancelAnimationFrame(resizeFrame);
            if (viewportFrame) cancelAnimationFrame(viewportFrame);
            resizeObserver?.disconnect();
            intersectionObserver?.disconnect();
            if (!resizeObserver) {
                window.removeEventListener("resize", scheduleResize);
            }
            if (!intersectionObserver) {
                window.removeEventListener("scroll", scheduleViewportCheck);
                window.removeEventListener("resize", scheduleViewportCheck);
            }
            document.removeEventListener("visibilitychange", handleVisibility);
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerleave", handlePointerLeave);
            if (supportsMotionChangeEvent) {
                motionQuery.removeEventListener("change", handleMotionPreference);
            } else {
                motionQuery.removeListener(handleMotionPreference);
            }
            gl.canvas.removeEventListener("webglcontextlost", handleContextLost);

            programs.forEach((program) => program.remove());
            geometry.remove();

            if (gl.canvas.parentNode === container) {
                container.removeChild(gl.canvas);
            }

            gl.getExtension("WEBGL_lose_context")?.loseContext();
        };
    }, [backgroundColor, beamColor, speed]);

    return (
        <div
            ref={containerRef}
            className={className}
            aria-hidden="true"
        />
    );
}

function programTime(program: Program, value: number) {
    program.uniforms.uTime.value = value;
}
