import { open } from 'node:fs/promises';

export async function readBoundedJson(path, maximumBytes, label) {
    if (typeof path !== 'string' || path.trim() === ''
        || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
        throw new Error(`${label} path or size boundary is invalid.`);
    }

    let handle;
    try {
        handle = await open(path, 'r');
    } catch {
        throw new Error(`${label} is missing or unreadable.`);
    }

    try {
        const buffer = Buffer.allocUnsafe(maximumBytes + 1);
        let bytesRead = 0;
        while (bytesRead < buffer.length) {
            const result = await handle.read(
                buffer,
                bytesRead,
                buffer.length - bytesRead,
                bytesRead,
            );
            if (result.bytesRead === 0) break;
            bytesRead += result.bytesRead;
        }
        if (bytesRead > maximumBytes) {
            throw new Error(`${label} exceeds ${maximumBytes} bytes.`);
        }

        let contents;
        try {
            contents = new TextDecoder('utf-8', { fatal: true })
                .decode(buffer.subarray(0, bytesRead));
        } catch {
            throw new Error(`${label} is not valid UTF-8.`);
        }

        try {
            return JSON.parse(contents);
        } catch {
            throw new Error(`${label} is not valid JSON.`);
        }
    } finally {
        await handle.close();
    }
}
