import React from 'react';
import { Header } from '@/components/home/Header';
import { Footer } from '@/components/home/Footer';
import { RequestDemoSection } from '@/components/requestdemo/RequestDemoSection';
import { EnterpriseGradeInfrastructure } from '@/components/requestdemo/EnterpriseGradeInfrastructureSection';
import { TrustedPartners } from '@/components/home/TrustedPartners';

export default function RequestDemo() {
	return (
		<>
			<Header ctaType="sales" />
			<RequestDemoSection />
			<TrustedPartners />
			<EnterpriseGradeInfrastructure />
			<Footer />
		</>
	);
}
