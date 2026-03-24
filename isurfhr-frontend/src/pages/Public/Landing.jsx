import React from 'react';
import { HeroSection } from '@/components/home/HeroSection';
import { Header } from '../../components/home/Header';
import { Footer } from '../../components/home/Footer';
import { TrustedPartners } from '@/components/home/TrustedPartners';
import { EmployeeLifecycle } from '@/components/home/EmployeeLifecycle';
import { PoweringEveryDepartment } from '@/components/home/PoweringEveryDepartment';
import { UnifiedInfrastructure } from '@/components/home/UnifiedInfrastructure';
import { DesignedForEveryStakeholder } from '@/components/home/DesignedForEveryStakeholder';
import { EnterpriseGradeInfrastructure } from '@/components/home/EnterpriseGradeInfrastructure';
import { CallToAction } from '@/components/home/CallToAction';

export default function Landing() {
	return (
		<>
			<Header />
			<HeroSection />
			<TrustedPartners />
			<EmployeeLifecycle />
			<PoweringEveryDepartment />
			<UnifiedInfrastructure />
			<DesignedForEveryStakeholder />
			<EnterpriseGradeInfrastructure />
			<CallToAction />
			<Footer />
		</>
	);
}
