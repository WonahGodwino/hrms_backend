import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const mockJobPostings = [
  { id: 1, title: "Marketing Manager" },
  { id: 2, title: "Software Engineer" },
  { id: 3, title: "Accounting Senior Analyst" },
];

const JobApplyPage = () => {
  const { id } = useParams();
  const job = mockJobPostings.find((j) => j.id === Number.parseInt(id));

  const [formData, setFormData] = useState({
    name: "",
    gender: "",
    address: "",
    email: "",
    phone: "",
    experience: "",
    resume: null,
  });

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === "resume") {
      setFormData({ ...formData, resume: files[0] });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSelectChange = (name, value) => {
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Application Submitted:", formData);
    alert("Your application has been submitted!");
  };

  if (!job) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-8 py-10">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">
            Job not found
          </h1>
          <Link
            to="/job-openings"
            className="text-primary hover:text-primary/80 hover:underline transition-colors"
          >
            Back to Listings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Right Form Panel */}
      <div className="flex-1 lg:flex-[3] flex items-center justify-center px-8 py-12 bg-background">
        <Card className="w-full max-w-2xl border-0 shadow-none">
          <CardContent className="p-0 space-y-6">
            <div className="text-center lg:text-left">
              <h2 className="text-3xl font-bold text-foreground mb-2">
                Application Form
              </h2>
              <p className="text-muted-foreground">
                Please fill out all required fields below
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <Link
                to={`/admin/job-applications/jobs/${job.id}`}
                className="absolute top-6 left-8 lg:top-12 lg:left-72 text-primary hover:text-primary hover:underline text-sm transition-colors z-10"
              >
                ← Back to Job Details
              </Link>
              {/* Personal Information Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
                  Personal Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-base font-medium">
                      Full Name *
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="h-11"
                      placeholder="Enter your full name"
                    />
                  </div>

                  {/* Gender */}
                  <div className="space-y-2">
                    <Label htmlFor="gender" className="text-base font-medium">
                      Gender *
                    </Label>
                    <Select
                      value={formData.gender}
                      onValueChange={(v) => handleSelectChange("gender", v)}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select Gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-base font-medium">
                    Address *
                  </Label>
                  <Input
                    id="address"
                    name="address"
                    type="text"
                    value={formData.address}
                    onChange={handleChange}
                    required
                    className="h-11"
                    placeholder="Enter your full address"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-base font-medium">
                      Email Address *
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      className="h-11"
                      placeholder="your.email@example.com"
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-base font-medium">
                      Phone Number *
                    </Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                      className="h-11"
                      placeholder="+234 xxx xxx xxxx"
                    />
                  </div>
                </div>
              </div>

              {/* Professional Information Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2">
                  Professional Information
                </h3>

                {/* Experience */}
                <div className="space-y-2">
                  <Label htmlFor="experience" className="text-base font-medium">
                    Previous Work Experience *
                  </Label>
                  <Textarea
                    id="experience"
                    name="experience"
                    value={formData.experience}
                    onChange={handleChange}
                    required
                    rows={4}
                    placeholder="Please describe your relevant work experience, skills, and achievements..."
                    className="resize-none"
                  />
                </div>

                {/* Resume Upload */}
                <div className="space-y-2">
                  <Label htmlFor="resume" className="text-base font-medium">
                    Resume / CV *
                  </Label>
                  <Input
                    id="resume"
                    name="resume"
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleChange}
                    required
                    className="h-12 file:mr-4 file:mt-1 file:py-1 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  />
                  <p className="text-xs text-muted-foreground">
                    Accepted formats: PDF, DOC, DOCX (Max size: 5MB)
                  </p>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <Button
                  type="submit"
                  className="w-full h-12 text-lg font-semibold"
                >
                  Submit Application
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  By submitting this application, you agree to our terms and
                  conditions.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default JobApplyPage;
