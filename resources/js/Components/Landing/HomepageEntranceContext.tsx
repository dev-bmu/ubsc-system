import {
    useCallback,
    createContext,
    type ReactNode,
    useContext,
    useState,
} from "react";

/*
 * Landing components are also reused on pages without the homepage loader.
 * The permissive default keeps those pages unchanged; HomePage explicitly
 * provides `false` until the loader reaches its synchronized reveal point.
 */
const HomepageEntranceContext = createContext(true);
const HomepageEntranceSignalContext = createContext<() => void>(() => {});

export function HomepageEntranceProvider({
    children,
    ready,
    initialReady = false,
}: {
    children: ReactNode;
    ready?: boolean;
    initialReady?: boolean;
}) {
    const [internalReady, setInternalReady] = useState(initialReady);
    const resolvedReady = ready ?? internalReady;
    const signalReady = useCallback(() => {
        if (ready === undefined) {
            setInternalReady(true);
        }
    }, [ready]);

    return (
        <HomepageEntranceSignalContext.Provider value={signalReady}>
            <HomepageEntranceContext.Provider value={resolvedReady}>
                {children}
            </HomepageEntranceContext.Provider>
        </HomepageEntranceSignalContext.Provider>
    );
}

export function useHomepageEntranceReady() {
    return useContext(HomepageEntranceContext);
}

export function useHomepageEntranceSignal() {
    return useContext(HomepageEntranceSignalContext);
}
