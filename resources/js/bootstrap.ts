import axios from 'axios';
window.axios = axios;

window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
window.axios.defaults.withCredentials = true;
window.axios.defaults.withXSRFToken = (config) => {
    try {
        return new URL(config.url ?? '', window.location.href).origin === window.location.origin;
    } catch {
        return false;
    }
};
