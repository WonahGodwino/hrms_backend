import axios from 'axios';

const API = axios.create({
	baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
	// baseURL: 'https://hrms.isurfglobal.com/api',
	headers: {
		'Content-Type': 'application/json',
	},
});

API.interceptors.request.use(
	(config) => {
		// Matches the 'authToken' key used in your AuthContext
		const token = localStorage.getItem('authToken');

		if (token) {
			config.headers = config.headers || {};
			config.headers.Authorization = `Bearer ${token}`;
		}

		return config;
	},
	(error) => {
		console.error('[API] Request error', error);
		return Promise.reject(error);
	}
);

// Response logger + 401 handler
API.interceptors.response.use(
	(res) => {
		return res;
	},
	(err) => {
		if (err.response) {
			console.warn('[API] Response error ←', err.response.status, err.response.config?.url);

			// Handle Unauthorized or Forbidden responses
			if (err.response.status === 401 || err.response.status === 403) {
				console.warn('[API] 401/403 — token may be missing/invalid/expired');

				// ** Had to comment this to keep the session tokens alive **
				// Clear both keys used in AuthContext to ensure clean slate
				// localStorage.removeItem("authUser");
				// localStorage.removeItem("authToken");

				// Optional: Redirect to login
				// window.location.href = "/login";
			}
		} else {
			console.error('[API] Network / unknown error', err);
		}
		return Promise.reject(err);
	}
);

export default API;
