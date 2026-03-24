// src/components/admin/VacancyFormModal.jsx
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getEnums } from "@/services/UtilsService";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { getCompanies } from "@/services/CompanyService";
import { useAuth } from "@/lib/context/AuthContext";

const VacancyForm = ({
  isOpen,
  setIsOpen,
  job = null, // if passed, we’re editing
  onCreate, // parent handles create API
  onEdit, // parent handles edit API
}) => {
  const { user } = useAuth() || {};
  const role = (user?.role || "").toString().toLowerCase();
  const isSuperuser = role === "superuser";

  // derive authCompanyId if present on user object (various shapes supported)
  const authCompanyId =
    user?.companyId ??
    user?.company_id ??
    (user?.company && (user.company.id ?? user.company._id)) ??
    null;

  const [form, setForm] = useState({
    title: "",
    location: "",
    companyId: "",
    jobType: "",
    schedule: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [enums, setEnums] = useState({ jobTypeEnum: [], scheduleEnum: [] });
  const [companies, setCompanies] = useState([]);

  // Initialize form when job changes or when authCompanyId / isSuperuser changes
  useEffect(() => {
    if (job) {
      setForm({
        title: job.title || "",
        location: job.location || "",
        companyId:
          (job.companyId ??
          job.company_id ??
          // if editing and job has no companyId but user is not superuser, use authCompanyId
          (!isSuperuser && authCompanyId ? String(authCompanyId) : "")) ||
          "",
        jobType: job.jobType || "",
        schedule: job.schedule || "",
        description: job.description || "",
      });
    } else {
      setForm({
        title: "",
        location: "",
        // if not superuser, prefill companyId from authenticated user (so hidden input will hold it)
        companyId: !isSuperuser && authCompanyId ? String(authCompanyId) : "",
        jobType: "",
        schedule: "",
        description: "",
      });
    }
  }, [job, authCompanyId, isSuperuser, isOpen]);

  // Fetch enums once
  useEffect(() => {
    const fetchEnums = async () => {
      try {
        const { data } = await getEnums();
        setEnums({
          jobTypeEnum: data?.jobTypeEnum ?? [],
          scheduleEnum: data?.scheduleEnum ?? [],
        });
      } catch (error) {
        console.error("Failed to fetch enums: ", error);
      }
    };

    fetchEnums();
  }, []);

  // Fetch companies only for superuser (they need to select company)
  useEffect(() => {
    if (!isSuperuser) return;

    const fetchCompanies = async () => {
      try {
        const res = await getCompanies();
        // getCompanies may return data wrapper or array; try to extract sensibly
        const payload = res?.data ?? res;
        // common shapes: array, { data: [] }, { companies: [] }
        let list = [];
        if (Array.isArray(payload)) list = payload;
        else if (Array.isArray(payload.companies)) list = payload.companies;
        else if (Array.isArray(payload.data)) list = payload.data;
        else if (Array.isArray(payload.items)) list = payload.items;
        else list = [];
        // normalize id field to prefer id or _id
        setCompanies(list);
      } catch (err) {
        console.error("Failed to fetch companies:", err);
      }
    };

    fetchCompanies();
  }, [isSuperuser]);

  const handleFormChange = (e) => {
    // accepts both native events and synthetic { target: { name, value } } objects used by Select
    const target = e?.target ?? e;
    const { name, value } = target || {};
    if (!name) return;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // determine final companyId (explicit form value preferred, fallback to authCompanyId)
    const companyIdFinal =
      (form.companyId && String(form.companyId).trim()) ||
      (!isSuperuser && authCompanyId ? String(authCompanyId) : "");

    if (
      !form.title.trim() ||
      !form.location.trim() ||
      !form.jobType.trim() ||
      !companyIdFinal
    ) {
      toast.error("Missing Information", {
        description: "Please fill in title, location, job type, and company.",
      });
      return;
    }

    setSubmitting(true);
    const payload = {
      title: form.title,
      location: form.location,
      companyId: companyIdFinal,
      jobType: form.jobType,
      schedule: form.schedule,
      description: form.description,
    };

    try {
      if (job) {
        await onEdit(job.id, payload);
        toast.success("Job posting updated successfully!");
      } else {
        await onCreate(payload);
        toast.success("Job posting created successfully!");
      }

      setForm({
        title: "",
        location: "",
        companyId: !isSuperuser && authCompanyId ? String(authCompanyId) : "",
        jobType: "",
        schedule: "",
        description: "",
      });
      setIsOpen(false);
    } catch (err) {
      console.error("Vacancy API failed:", err);
      toast.error("Something went wrong", {
        description:
          err?.response?.data?.message || err.message || "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <div className="flex justify-between items-center">
          <DialogTitle className="text-lg font-semibold">
            {job ? "Edit Vacancy" : "Create Vacancy"}
          </DialogTitle>
        </div>

        <form className="space-y-4 pt-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="companyId">Company</Label>

            {isSuperuser ? (
              <Select
                value={form.companyId}
                onValueChange={(v) =>
                  handleFormChange({ target: { name: "companyId", value: v } })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => {
                    const cid = company.id ?? company._id ?? company.companyId;
                    const name = company.name ?? company.companyName ?? cid;
                    return (
                      <SelectItem key={cid} value={String(cid)}>
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : (
              // non-superusers: hide the selector and keep hidden input to carry companyId
              <>
                <input
                  type="hidden"
                  name="companyId"
                  value={form.companyId || ""}
                />
                <div className="text-sm text-muted-foreground">
                  {authCompanyId ? (
                    <>Company set to your organization</>
                  ) : (
                    <>No company available</>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Job Title</Label>
            <Input
              id="title"
              name="title"
              value={form.title}
              onChange={handleFormChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              name="location"
              value={form.location}
              onChange={handleFormChange}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Job Type */}
            <div className="space-y-2">
              <Label htmlFor="jobType">Job Type</Label>
              <Select
                value={form.jobType}
                onValueChange={(v) =>
                  handleFormChange({ target: { name: "jobType", value: v } })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select job type" />
                </SelectTrigger>
                <SelectContent>
                  {enums.jobTypeEnum.map((jobType) => (
                    <SelectItem key={jobType} value={jobType}>
                      {jobType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Schedule */}
            <div className="space-y-2">
              <Label htmlFor="schedule">Schedule</Label>
              <Select
                value={form.schedule}
                onValueChange={(v) =>
                  handleFormChange({ target: { name: "schedule", value: v } })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select schedule" />
                </SelectTrigger>
                <SelectContent>
                  {enums.scheduleEnum.map((schedule) => (
                    <SelectItem key={schedule} value={schedule}>
                      {schedule}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Job Description</Label>
            <Textarea
              id="description"
              name="description"
              value={form.description}
              rows={4}
              onChange={handleFormChange}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" className="flex-1" disabled={submitting}>
              {submitting
                ? job
                  ? "Updating..."
                  : "Posting..."
                : job
                ? "Update Vacancy"
                : "Post Vacancy"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default VacancyForm;
