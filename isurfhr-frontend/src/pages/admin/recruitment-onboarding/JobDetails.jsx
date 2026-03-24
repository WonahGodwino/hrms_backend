import { useParams, Link, useNavigate } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const mockJobPostings = [
  {
    id: 1,
    title: "Marketing Manager",
    roleType: "Intern Program",
    location: "Lagos, Nigeria",
    posted: "Posted 2 days ago",
    about:
      "During the Intern Program, you will work across the Corporate Affairs Advocacy, Partnerships, and Communications teams on a variety of projects designed to grow your capabilities and add business value. You can also expect cross-functional opportunities that increase your business knowledge as you collaborate to deliver results. This role will be based in Chevron's new building at One The Esplanade.",
    requirements:
      "For Corporate Affairs, we encourage applications from motivated and talented university students with individual stream or combination of public relations, marketing, media (including digital media), communications, commerce, or related disciplines, with a keen interest in the oil and gas industry and advancing the cleaner energy solutions needed for a lower carbon future.",
  },
  {
    id: 2,
    title: "Software Engineer",
    roleType: "Part time",
    location: "Abuja",
    posted: "Posted Yesterday",
    about:
      "Join our team as a Software Engineer where you will be responsible for building, maintaining, and improving software solutions. You must have solid experience with modern web technologies (React, Node.js) and should be able to work collaboratively in an agile environment.",
    requirements:
      "Bachelor's degree in Computer Science or related field. Experience with React, Node.js, and modern JavaScript. Strong collaboration and problem-solving skills.",
  },
  {
    id: 3,
    title: "Accounting Senior Analyst",
    roleType: "Contract",
    location: "Port Harcourt",
    posted: "Posted 3 days ago",
    about:
      "We are seeking a detail-oriented Accounting Senior Analyst to oversee budgeting, forecasting, and financial analysis. The ideal candidate must have strong analytical skills, be proficient with financial modeling, and have experience in multinational environments.",
    requirements:
      "Bachelor's degree in Finance, Accounting, or related field. 5+ years experience. CPA or similar certification preferred.",
  },
]

const JobDetailsPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const job = mockJobPostings.find((j) => j.id === Number.parseInt(id))

  if (!job) {
    return (
      <div className="min-h-screen bg-background px-8 py-10">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-destructive">Job not found</h1>
          <Link
            to="/admin/vacancies"
            className="mt-4 inline-block text-primary hover:text-primary/80 hover:underline transition-colors"
          >
            Back to Listings
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <Link
          to="/admin/vacancies"
          className="text-primary font-medium text-sm mb-6 inline-block hover:text-primary/80 hover:underline transition-colors"
        >
          ← Back to Listings
        </Link>

        <Card className="bg-card shadow-md rounded-lg border border-border">
          <CardContent className="p-6">
            <div className="space-y-6">
              {/* Header Section */}
              <div className="space-y-3">
                <h1 className="text-3xl font-extrabold text-primary">{job.title}</h1>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-card-foreground text-sm font-semibold">Role Type:</span>
                    <Badge variant="secondary" className="text-xs">
                      {job.roleType}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    <span className="font-semibold">Location:</span> {job.location}
                  </p>
                  <p className="text-xs text-muted-foreground/70">{job.posted}</p>
                </div>
              </div>

              {/* About Section */}
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-card-foreground">About the Role</h2>
                <p className="text-card-foreground leading-relaxed">{job.about}</p>
              </div>

              {/* Requirements Section */}
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-card-foreground">Eligibility / Requirements</h2>
                <p className="text-card-foreground leading-relaxed">{job.requirements}</p>
              </div>

              {/* Apply Button */}
              <div className="pt-4">
                <Button onClick={() => navigate(`job-apply/${job.id}`)} className="px-6 py-2">
                  Apply
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default JobDetailsPage;
