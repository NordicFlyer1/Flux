import { exists, xf, once, print, } from '../functions.js';
import { DialogMsg } from './enums.js';
import { uuid } from '../storage/uuid.js';

function Auth(args = {}) {
    const config = args.config;
    const api_uri = config.get().API_URI;
    const pwa_uri = config.get().PWA_URI;

    let turnstileLoaded = false;
    let _loggedIn = false;
    let _hasApi = true;

    // User is logged-in -> don't show or remove
    // User is not-logged-in ->
    //     -> navigation at profile -> show
    //
    function loadTurnstile() {
        if(!_loggedIn && _hasApi) {
            const script = document.createElement('script');
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
            turnstileLoaded = true;
        }
    };

    function unloadTurnstile() {
    }

    function isBrowser() {
        return (
            ('bluetooth' in navigator) && ('wakeLock' in navigator)
        );
    }

    // {data: {FormData}} -> Void
    async function register(args = {}) {
        const url = `${api_uri}/api/register`;
        const data = args.data;

        if(data.email.trim() === '' ||
            data.password.trim() === '' ||
            data.password_confirmation.trim() === '' ||
            !isBrowser()
            ) {
            console.log(`:register :blocked :is-browser ${isBrowser()}`);
            return;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json',},
                body: JSON.stringify(data),
            });

            const status = response.status;
            const json = await response.json();

            if(json.error) {
                console.log(':api :register :error');
                xf.dispatch('action:auth', ':error');
                return;
            }
            if(json?.result?.success) {
                console.log(':api :register :success');
                xf.dispatch('action:nav', 'settings:profile');
                xf.dispatch('action:auth', ':password:login');
                return;
            }

            console.log(`register: :none`);
        } catch(error) {
            console.log(error);
        }
    }

    // {data: {FormData}} -> Void
    async function login(args = {}) {
        const url = `${api_uri}/api/login`;
        const data = args.data;

        if(data.email.trim() === '' ||
           data.password.trim() === '' ||
           !isBrowser()) {
            console.log(`:login :blocked :is-browser ${isBrowser()}`);
            return;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json',},
                credentials: 'include',
                body: JSON.stringify(data),
            });

            const json = await response.json();

            if(json.error) {
                console.log(`:api :login :error`);
                xf.dispatch('action:auth', ':error');
                return;
            }

            if(json?.result?.success) {
                console.log(`:api :login :success`);
                xf.dispatch('action:auth', ':password:profile');
                status();
                return;
            }

            console.log(`:api :login :none`);
        } catch(error) {
            console.log(error);
        }
    }

    async function logout() {
        const url = `${api_uri}/api/logout`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json',},
                credentials: 'include',
                body: JSON.stringify({logout: true}),
            });

            const result = await response.json();
            console.log(`:api :logout :success`);
            xf.dispatch('action:auth', ':password:logout');
            status();
        } catch(error) {
            console.log(error);
        }
    }

    // {data: {FormData}} -> Void
    async function forgot(args = {}) {
        const url = `${api_uri}/api/forgot-password`;
        const data = args.data;

        if(data.email.trim() === '' || !isBrowser()) {
            console.log(`:forgot :blocked :is-browser ${isBrowser()}`);
            return;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json',},
                credentials: 'include',
                body: JSON.stringify(data),
            });

            console.log(`:api :forgot :success`);
            xf.dispatch('action:auth', ':password:login');
            // TODO: display message email has been send if email exists
        } catch(error) {
            console.log(error);
        }
    }

    // {data: {FormData}} -> Void
    async function reset(args = {}) {
        const params = (new URL(document.location)).searchParams;
        const token = params.get('token') ?? '';

        const url = `${api_uri}/api/reset-password`;

        const data = args.data;
        data.token = token;

        if(data.password.trim() === '' ||
           data.password_confirmation.trim() === '' ||
           !isBrowser()) {
            console.log(`:reset :blocked :is-browser ${isBrowser()}`);
            return;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json',},
                body: JSON.stringify(data),
            });

            if(response.ok) {
                console.log(`:api :reset :success`);
                window.history.pushState({}, document.title, window.location.pathname);
                xf.dispatch('action:auth', ':password:login');
            } else {
                console.error(`:api :reset :fail`);
                xf.dispatch('action:auth', ':error');
            }
        } catch(e) {
            console.error(`:api :reset :error `, e);
        }
    }

    async function status() {
        const url = `${api_uri}/api/rpc`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json',},
                credentials: 'include',
                body: JSON.stringify({
                    id: uuid(),
                    method: 'status_handler',
                    params: {data: {}},
                }),
            });

            const status = response.status;
            const body = await response.json();

            if(status === 200) {
                console.log(`:api :profile`);
                _loggedIn = true;
                xf.dispatch('action:auth', ':password:profile');
                xf.dispatch('services', body?.result);
                return body.result;
            }
            if(status === 403) {
                _loggedIn = false;
                xf.dispatch('action:status', ':logout');
                xf.dispatch('action:auth', ':password:login');
                return {strava: false, intervals: false, trainingPeaks: false};
            }
            if(status === 500 || status === 405) {
                _loggedIn = false;
                _hasApi = false;
                console.log(`:api :no-api`);
                xf.dispatch('action:auth', ':no-api');
                return {strava: false, intervals: false, trainingPeaks: false};
            }

            return {strava: false, intervals: false, trainingPeaks: false};
        } catch(error) {
            console.log(`:api :no-api`);
            xf.dispatch('action:auth', ':no-api');
            return {strava: false, intervals: false, trainingPeaks: false};
        }
    }

    return Object.freeze({
        register,
        login,
        logout,
        forgot,
        reset,
        status,
        loadTurnstile,
    });
}

export default Auth;

