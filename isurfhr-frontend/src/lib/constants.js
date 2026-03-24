import { format } from 'date-fns';
export const formatDateForAPI = (date) => {
	return format(date, 'yyyy-MM-dd');
};
