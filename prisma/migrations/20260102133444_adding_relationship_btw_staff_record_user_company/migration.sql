-- AddForeignKey
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
