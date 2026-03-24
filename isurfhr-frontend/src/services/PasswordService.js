import API from './axios';

export const forgotPassword = async (email) => API.post('/auth/forgot-password', { email });
export const resetPassword = async (payload) => API.post('/auth/reset-password', payload);
export const verifyOTP = async (payload) => API.post('/auth/verify-otp', payload);
