import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { getAccessibleCompany } from '@/services/CompanyService';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
	const [user, setUser] = useState(null);
	const [token, setToken] = useState(null);

	const [companies, setCompanies] = useState([]);
	const [currentCompany, setCurrentCompany] = useState(null);

	const [initializing, setInitializing] = useState(true);

	// ----------------------------
	// Restore Auth Session
	// ----------------------------
	useEffect(() => {
		try {
			const storedUserRaw = localStorage.getItem('authUser');
			const storedToken = localStorage.getItem('authToken');
			const storedCompaniesRaw = localStorage.getItem('userCompanies');
			const storedCurrentRaw = localStorage.getItem('currentCompany');

			const storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
			const storedCompanies = storedCompaniesRaw ? JSON.parse(storedCompaniesRaw) : [];
			const storedCurrent = storedCurrentRaw ? JSON.parse(storedCurrentRaw) : null;

			if (storedUser && storedToken) {
				setUser(storedUser);
				setToken(storedToken);
				setCompanies(storedCompanies || []);
				setCurrentCompany(storedCurrent || null);
			}
		} catch (err) {
			console.warn('AuthProvider: failed restoring session', err);
		} finally {
			setInitializing(false);
		}
	}, []);

	// ----------------------------
	// Fetch Companies When Authenticated
	// ----------------------------
	useEffect(() => {
		if (!user || !token) return;

		const fetchCompanies = async () => {
			try {
				const response = await getAccessibleCompany();
				const transformed = response.data.data.map((company) => ({
					id: company.id,
					name: company.companyName || 'Unknown Company',
					status: company.status || 'active',
					email: company.email,
				}));

				setCompanies(transformed);
				localStorage.setItem('userCompanies', JSON.stringify(transformed));

				// Validate currentCompany
				if (transformed.length > 0) {
					const storedCurrentRaw = localStorage.getItem('currentCompany');
					const storedCurrent = storedCurrentRaw ? JSON.parse(storedCurrentRaw) : null;

					const stillExists = storedCurrent ? transformed.some((c) => c.id === storedCurrent.id) : false;

					const finalCompany = stillExists ? storedCurrent : transformed[0];

					setCurrentCompany(finalCompany);
					localStorage.setItem('currentCompany', JSON.stringify(finalCompany));
				}
			} catch (err) {
				console.warn('Failed to fetch companies', err);
			}
		};

		fetchCompanies();
	}, [user, token]);

	// ----------------------------
	// Login
	// ----------------------------
	const login = (userData, jwtToken) => {
		setUser(userData);
		setToken(jwtToken);

		localStorage.setItem('authUser', JSON.stringify(userData));
		localStorage.setItem('authToken', jwtToken);
	};

	// ----------------------------
	// Switch Company
	// ----------------------------
	const switchCompany = (company) => {
		const finalCompany = {
			id: company.id,
			name: company.name,
		};

		setCurrentCompany(finalCompany);
		localStorage.setItem('currentCompany', JSON.stringify(finalCompany));
	};

	// ----------------------------
	// Logout (Atomic Reset)
	// ----------------------------
	const logout = () => {
		setUser(null);
		setToken(null);
		setCompanies([]);
		setCurrentCompany(null);

		localStorage.removeItem('authUser');
		localStorage.removeItem('authToken');
		localStorage.removeItem('userCompanies');
		localStorage.removeItem('currentCompany');
	};

	// ----------------------------
	// Derived Values
	// ----------------------------
	const isSuperAdmin = Boolean(user?.role === 'SUPER_ADMIN');
	const isAuthenticated = Boolean(user);
	const hasMultipleCompanies = companies.length > 1;
	const companyId = currentCompany?.id ?? null;

	const contextValue = useMemo(
		() => ({
			user,
			token,
			initializing,
			isAuthenticated,
			isSuperAdmin,

			// Company scope
			companies,
			currentCompany,
			hasMultipleCompanies,
			companyId,
			switchCompany,

			// Auth actions
			login,
			logout,
		}),
		[user, token, initializing, isAuthenticated, isSuperAdmin, companies, currentCompany, hasMultipleCompanies, companyId]
	);

	return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export default AuthProvider;

// import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

// // Create the context (not exported as a top-level API except via hooks/provider)
// const AuthContext = createContext();

// // Hook to use auth context
// export const useAuth = () => useContext(AuthContext);

// // small helper to safely read candidate company id from user shapes
// const extractCompanyId = (user = {}) => user?.companyId ?? user?.company_id ?? (user?.company && (user.company.id ?? user.company._id)) ?? null;

// // Provider component
// export function AuthProvider({ children }) {
// 	const [user, setUser] = useState(null); // { name, email, role, companyId }
// 	const [token, setToken] = useState(null);
// 	const [initializing, setInitializing] = useState(true);

// 	useEffect(() => {
// 		// synchronous safe read from localStorage
// 		try {
// 			const storedUserRaw = localStorage.getItem('authUser');
// 			const storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
// 			const storedToken = localStorage.getItem('authToken');

// 			if (storedUser && storedToken) {
// 				// Removed normalization: keep role as is
// 				const finalUser = {
// 					...storedUser,
// 					role: storedUser.role || null,
// 					companyId: extractCompanyId(storedUser),
// 				};
// 				setUser(finalUser);
// 				setToken(storedToken);
// 			}
// 		} catch (err) {
// 			// keep logging but continue — we'll treat as not authenticated
// 			console.warn('AuthProvider: failed to read stored auth', err);
// 		} finally {
// 			setInitializing(false); // done restoring
// 		}
// 	}, []);

// 	// Login function — preserves companyId if present and keeps role as is
// 	const login = (userData, jwtToken) => {
// 		const finalUser = {
// 			...userData,
// 			role: userData?.role || null, // Removed toLowerCase()
// 			companyId: extractCompanyId(userData),
// 		};
// 		setUser(finalUser);
// 		setToken(jwtToken);
// 		try {
// 			localStorage.setItem('authUser', JSON.stringify(finalUser));
// 			localStorage.setItem('authToken', jwtToken);
// 		} catch (err) {
// 			console.warn('AuthProvider: failed to persist auth', err);
// 		}
// 	};

// 	// Logout function
// 	const logout = () => {
// 		setUser(null);
// 		setToken(null);
// 		try {
// 			localStorage.removeItem('authUser');
// 			localStorage.removeItem('authToken');
// 			localStorage.removeItem('userCompanies');
// 			localStorage.removeItem('currentCompany');
// 		} catch (err) {
// 			console.warn('AuthProvider: failed to remove persisted auth', err);
// 		}
// 	};

// 	// Derived helpers exposed on context for convenience
// 	// Updated check: strictly checks for "SUPER_ADMIN"
// 	const isSuperAdmin = Boolean(user?.role === 'SUPER_ADMIN');

// 	const companyId = user?.companyId ?? null;

// 	// Memoize value to avoid unnecessary re-renders in consumers
// 	const contextValue = useMemo(
// 		() => ({
// 			user,
// 			token,
// 			initializing,
// 			isAuthenticated: !!user,
// 			isSuperAdmin,
// 			companyId,
// 			login,
// 			logout,
// 		}),
// 		[user, token, initializing, isSuperAdmin, companyId]
// 	);

// 	return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
// }

// // Keep a default export
// export default AuthProvider;
