import API from './axios'; // your existing axios wrapper

export const getDashboardStats = () => {
	return API.get('/admin/dashboard/stats');
};
