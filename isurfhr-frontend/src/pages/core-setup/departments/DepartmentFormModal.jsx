// src/components/admin/DepartmentFormModal.jsx
import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/context/AuthContext";

const NONE = "__none__";

/**
 * DepartmentFormModal
 *
 * Props:
 *  - isOpen
 *  - setIsOpen
 *  - department (optional)  // edit mode
 *  - onCreate(payload)
 *  - onEdit(id, payload)
 *  - companyOptions: [{ id, name }]
 */
const DepartmentFormModal = ({
  isOpen,
  setIsOpen,
  department = null,
  onCreate = async () => {},
  onEdit = async () => {},
  companyOptions = [],
}) => {
  const { isSuperuser, companyId: authCompanyId } = useAuth() || {};

  const [form, setForm] = useState({
    companyId: "",
    name: "",
    code: "",
    hod: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // whether to show the company selector:
  // show only for superusers (superuser manages multiple companies).
  const showCompanySelect = Boolean(isSuperuser);

  useEffect(() => {
    if (department) {
      setForm({
        companyId:
          department.companyId !== undefined && department.companyId !== null
            ? String(department.companyId)
            : // if editing and department doesn't have companyId, fallback to auth's companyId for non-superusers
            !showCompanySelect && authCompanyId
            ? String(authCompanyId)
            : "",
        name: department.name ?? "",
        code: department.code ?? "",
        hod: department.hod ?? "",
      });
    } else {
      setForm({
        // For non-superusers, prefill companyId to their company if available
        companyId:
          !showCompanySelect && authCompanyId ? String(authCompanyId) : "",
        name: "",
        code: "",
        hod: "",
      });
    }
    // whenever the modal opens/closes or department changes we reset; keep logic intact
  }, [department, isOpen, showCompanySelect, authCompanyId]);

  const handleChange = (e) => {
    const { name, value } = e.target || {};
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSelect = (name, value) =>
    setForm((p) => ({ ...p, [name]: value === NONE ? "" : value }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("Department name is required");
      return;
    }

    setSubmitting(true);
    try {
      // Ensure companyId in payload: prefer explicit value in form, otherwise fall back to authCompanyId for non-superusers
      const companyIdFinal =
        form.companyId && String(form.companyId).trim()
          ? String(form.companyId)
          : !showCompanySelect && authCompanyId
          ? String(authCompanyId)
          : null;

      const payload = {
        companyId: companyIdFinal,
        name: form.name.trim(),
        code: form.code?.trim() || null,
        hod: form.hod?.trim() || null,
      };

      if (department && department.id) {
        await onEdit(department.id, payload);
        toast.success("Department updated");
      } else {
        await onCreate(payload);
        toast.success("Department created");
      }
      setIsOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="space-y-2">
          <DialogTitle>
            {department ? "Edit Department" : "Add Department"}
          </DialogTitle>
        </DialogHeader>

        <form className="space-y-6 pt-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Company Select (only show to superusers) */}
            {showCompanySelect ? (
              <div className="space-y-4">
                <Label>Company</Label>
                <Select
                  value={form.companyId || ""}
                  onValueChange={(v) => handleSelect("companyId", v)}
                >
                  <SelectTrigger className="w-full h-10">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {companyOptions
                      .filter((c) => c && c.id !== undefined && c.id !== null)
                      .map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              // If not showing select, we still keep companyId in the form state (hidden)
              <input
                type="hidden"
                name="companyId"
                value={form.companyId || ""}
              />
            )}

            {/* Department Name */}
            <div className="space-y-4">
              <Label>Department Name</Label>
              <Input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Engineering"
              />
            </div>

            {/* Department Code */}
            <div className="space-y-4">
              <Label>Department Code</Label>
              <Input
                name="code"
                value={form.code}
                onChange={handleChange}
                placeholder="e.g. ENG"
              />
            </div>

            {/* Department HOD */}
            <div className="space-y-4">
              <Label>Department HOD</Label>
              <Input
                name="hod"
                value={form.hod}
                onChange={handleChange}
                placeholder="Head of Department"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : department ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DepartmentFormModal;
