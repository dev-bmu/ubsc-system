import { useRef, useEffect, useCallback } from "react";
import { Renderer, Program, Mesh, Triangle, type OGLRenderingContext } from "ogl";

interface LiquidChromeProps {
    baseColor?: [number, number, number];
    speed?: number;
    amplitude?: number;
    frequencyX?: number;
    frequencyY?: number;
    interactive?: boolean;
    className?: string;
}

const VERTEX = /* glsl */ `
    attribute vec2 position;
    attribute vec2 uv;
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 0.0, 1.0);
    }
`;

const FRAGMENT = /* glsl */ `
    precision highp float;

    uniform float uTime;
    uniform vec3  uResolution;
    uniform vec3  uBaseColor;
    uniform float uAmplitude;
    uniform float uFrequencyX;
    uniform float uFrequencyY;
    uniform vec2  uMouse;

    varying vec2 vUv;

    vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    vec2 fade(vec2 t)    { return t*t*t*(t*(t*6.0-15.0)+10.0); }

    float cnoise(vec2 P) {
        vec4 Pi = floor(P.xyxy) + vec4(0,0,1,1);
        vec4 Pf = fract(P.xyxy) - vec4(0,0,1,1);
        Pi = mod(Pi, 289.0);
        vec4 ix = Pi.xzxz, iy = Pi.yyww;
        vec4 fx = Pf.xzxz, fy = Pf.yyww;
        vec4 i = permute(permute(ix)+iy);
        vec4 gx = 2.0*fract(i*0.0243902439)-1.0;
        vec4 gy = abs(gx)-0.5;
        vec4 tx = floor(gx+0.5);
        gx = gx - tx;
        vec2 g00 = vec2(gx.x,gy.x);
        vec2 g10 = vec2(gx.y,gy.y);
        vec2 g01 = vec2(gx.z,gy.z);
        vec2 g11 = vec2(gx.w,gy.w);
        vec4 norm = 1.79284291400159-0.85373472095314*
            vec4(dot(g00,g00),dot(g01,g01),dot(g10,g10),dot(g11,g11));
        g00 *= norm.x; g01 *= norm.y;
        g10 *= norm.z; g11 *= norm.w;
        float n00 = dot(g00, vec2(fx.x, fy.x));
        float n10 = dot(g10, vec2(fx.y, fy.y));
        float n01 = dot(g01, vec2(fx.z, fy.z));
        float n11 = dot(g11, vec2(fx.w, fy.w));
        vec2 fade_xy = fade(Pf.xy);
        vec2 n_x = mix(vec2(n00,n01), vec2(n10,n11), fade_xy.x);
        return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
    }

    void main() {
        vec2 fragCoord = vUv * uResolution.xy;
        vec2 uv = (2.0 * fragCoord - uResolution.xy) / min(uResolution.x, uResolution.y);

        // Iterative warping — creates the chrome distortion
        for (float i = 1.0; i < 10.0; i++) {
            uv.x += uAmplitude / i * cos(i * uFrequencyX * uv.y + uTime + uMouse.x * 3.14159);
            uv.y += uAmplitude / i * cos(i * uFrequencyY * uv.x + uTime + uMouse.y * 3.14159);
        }

        // Mouse influence — subtle distortion near cursor
        vec2 diff = (vUv - uMouse) * 2.0;
        float mouseInfluence = exp(-dot(diff, diff) * 3.0);

        // Chrome coloring — metallic reflections
        float chrome = cos(uv.x + uv.y + 1.0) * 0.5 + 0.5;

        // Add Perlin noise for organic variation
        float noise = cnoise(uv * 1.5 + uTime * 0.3) * 0.15;

        // Metallic shading with specular highlights
        float highlight = pow(chrome, 3.0);
        float ambient  = chrome * 0.6 + 0.08;

        vec3 color = uBaseColor + vec3(ambient + highlight * 0.65 + noise);

        // Subtle mouse-reactive glow
        color += mouseInfluence * vec3(0.04, 0.04, 0.05);

        // Tone mapping — keeps it professional, not blown out
        color = color / (1.0 + color * 0.4);

        gl_FragColor = vec4(color, 1.0);
    }
`;

export default function LiquidChrome({
    baseColor = [0.1, 0.1, 0.1],
    speed = 0.2,
    amplitude = 0.5,
    frequencyX = 3,
    frequencyY = 2,
    interactive = true,
    className = "",
}: LiquidChromeProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
    const targetMouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!interactive) return;
            targetMouseRef.current = {
                x: e.clientX / window.innerWidth,
                y: 1.0 - e.clientY / window.innerHeight,
            };
        },
        [interactive],
    );

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const renderer = new Renderer({ antialias: true, alpha: false });
        const gl: OGLRenderingContext = renderer.gl;
        gl.clearColor(0.04, 0.04, 0.04, 1);
        container.appendChild(gl.canvas);

        const geometry = new Triangle(gl);

        const program = new Program(gl, {
            vertex: VERTEX,
            fragment: FRAGMENT,
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: [gl.canvas.width, gl.canvas.height, 1] },
                uBaseColor: { value: baseColor },
                uAmplitude: { value: amplitude },
                uFrequencyX: { value: frequencyX },
                uFrequencyY: { value: frequencyY },
                uMouse: { value: [0.5, 0.5] },
            },
        });

        const mesh = new Mesh(gl, { geometry, program });

        // Resize handler
        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio, 2);
            const w = container.clientWidth;
            const h = container.clientHeight;
            renderer.setSize(w, h);
            gl.canvas.style.width = w + "px";
            gl.canvas.style.height = h + "px";
            renderer.dpr = dpr;
            program.uniforms.uResolution.value = [w * dpr, h * dpr, 1];
        };
        resize();

        const ro = new ResizeObserver(resize);
        ro.observe(container);

        // Mouse listener
        window.addEventListener("mousemove", handleMouseMove, {
            passive: true,
        });

        // Animation loop
        let raf: number;
        let startTime = performance.now();

        const update = () => {
            raf = requestAnimationFrame(update);

            const elapsed = (performance.now() - startTime) * 0.001;
            program.uniforms.uTime.value = elapsed * speed;

            // Smooth mouse lerp
            const lerp = 0.04;
            mouseRef.current.x +=
                (targetMouseRef.current.x - mouseRef.current.x) * lerp;
            mouseRef.current.y +=
                (targetMouseRef.current.y - mouseRef.current.y) * lerp;
            program.uniforms.uMouse.value = [
                mouseRef.current.x,
                mouseRef.current.y,
            ];

            renderer.render({ scene: mesh });
        };
        raf = requestAnimationFrame(update);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("mousemove", handleMouseMove);
            ro.disconnect();
            if (gl.canvas.parentNode === container) {
                container.removeChild(gl.canvas);
            }
            gl.getExtension("WEBGL_lose_context")?.loseContext();
        };
    }, [baseColor, speed, amplitude, frequencyX, frequencyY, handleMouseMove]);

    return (
        <div
            ref={containerRef}
            className={className}
            aria-hidden="true"
            style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                contain: "paint",
            }}
        />
    );
}
