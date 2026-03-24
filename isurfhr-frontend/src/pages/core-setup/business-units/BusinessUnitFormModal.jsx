// src/components/admin/BusinessUnitFormModal.jsx
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

const BusinessUnitFormModal = ({
  isOpen,
  setIsOpen,
  businessUnit = null,
  onCreate = async () => {},
  onEdit = async () => {},
  departmentOptions = [], // should always be FULL list
  companyOptions = [],
}) => {
  const { user } = useAuth() || {};
  const role = (user?.role || "").toString().toLowerCase();
  const isSuperuser = role === "superuser";
  const authCompanyId =
    user?.companyId ??
    user?.company_id ??
    (user?.company && (user.company.id ?? user.company._id)) ??
    null;

  const [form, setForm] = useState({
    companyId: "",
    departmentId: "",
    name: "",
    unitHeadName: "",
    unitHeadEmail: "",
    designation: "",
    position: "Unit Head",
  });
  const [submitting, setSubmitting] = useState(false);

  const showCompanySelect = Boolean(isSuperuser);

  const getDeptCompanyId = (d) =>
    d?.companyId ?? d?.company?.id ?? d?.company?._id ?? null;

  const extractCompanyIdFromUnit = (u) =>
    u?.companyId ?? u?.company?.id ?? u?.company?._id ?? u?.company_id ?? null;
  const extractDepartmentIdFromUnit = (u) =>
    u?.departmentId ??
    u?.department?.id ??
    u?.department?._id ??
    u?.department_id ??
    null;

  // Sync form when opening modal
  useEffect(() => {
    if (businessUnit) {
      const cu = String(extractCompanyIdFromUnit(businessUnit) ?? "") || "";
      const cd = String(extractDepartmentIdFromUnit(businessUnit) ?? "") || "";

      setForm({
        companyId:
          cu ||
          (!showCompanySelect && authCompanyId ? String(authCompanyId) : ""),
        departmentId: cd,
        name: businessUnit.name ?? "",
        unitHeadName: businessUnit.unitHeadName ?? "",
        unitHeadEmail: businessUnit.unitHeadEmail ?? "",
        designation: businessUnit.designation ?? "",
        position: businessUnit.position ?? "Unit Head",
      });
    } else {
      let defaultCompany = "";
      if (showCompanySelect) {
        if (companyOptions && companyOptions.length > 0) {
          defaultCompany = String(companyOptions[0].id);
        }
      } else if (authCompanyId) {
        defaultCompany = String(authCompanyId);
      }

      setForm({
        companyId: defaultCompany,
        departmentId: "",
        name: "",
        unitHeadName: "",
        unitHeadEmail: "",
        designation: "",
        position: "Unit Head",
      });
    }
  }, [businessUnit, isOpen, showCompanySelect, authCompanyId, companyOptions]);

  // Clear invalid department when switching company
  useEffect(() => {
    const selectedCompany =
      (form.companyId && String(form.companyId)) ||
      (!showCompanySelect && authCompanyId)
        ? String(form.companyId || authCompanyId)
        : "";

    if (!form.departmentId) return;

    const currentDept = departmentOptions.find(
      (d) => String(d.id) === String(form.departmentId)
    );

    if (currentDept) {
      const deptCompanyId = getDeptCompanyId(currentDept);
      if (deptCompanyId && String(deptCompanyId) !== String(selectedCompany)) {
        setForm((p) => ({ ...p, departmentId: "" }));
      }
    } else {
      setForm((p) => ({ ...p, departmentId: "" }));
    }
  }, [form.companyId, form.departmentId, departmentOptions, authCompanyId, showCompanySelect]);

  const handleChange = (e) => {
    const { name, value } = e.target || {};
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSelect = (name, value) =>
    setForm((p) => ({ ...p, [name]: value === NONE ? "" : value }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("Business Unit name is required");
      return;
    }

    const companyIdFinal =
      form.companyId && String(form.companyId).trim()
        ? String(form.companyId)
        : !showCompanySelect && authCompanyId
        ? String(authCompanyId)
        : null;

    if (!companyIdFinal) {
      toast.error("Company is required");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        companyId: companyIdFinal,
        departmentId: form.departmentId ? String(form.departmentId) : null,
        name: form.name.trim(),
        unitHeadName: form.unitHeadName?.trim() || null,
        unitHeadEmail: form.unitHeadEmail?.trim() || null,
        designation: form.designation?.trim() || null,
        position: form.position?.trim() || "Unit Head",
      };

      if (businessUnit && businessUnit.id) {
        await onEdit(businessUnit.id, payload);
        toast.success("Business Unit updated");
      } else {
        await onCreate(payload);
        toast.success("Business Unit created");
      }
      setIsOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  // ✅ Departments are now filtered dynamically inside modal itself
  const companyFilterId =
    form.companyId || (!showCompanySelect && authCompanyId) || "";
  const availableDepartments = departmentOptions.filter((d) => {
    if (!companyFilterId) return true;
    const cid = getDeptCompanyId(d);
    if (!cid) return true;
    return String(cid) === String(companyFilterId);
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="space-y-2">
          <DialogTitle>
            {businessUnit ? "Edit Business Unit" : "Add Business Unit"}
          </DialogTitle>
        </DialogHeader>

        <form className="space-y-6 pt-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Company Select (superuser only) */}
            {showCompanySelect ? (
              <div className="space-y-4">
                <Label>Company</Label>
                <Select
                  value={form.companyId ? String(form.companyId) : NONE}
                  onValueChange={(v) => {
                    setForm((p) => ({
                      ...p,
                      companyId: v === NONE ? "" : v,
                      departmentId: "", // reset department when switching company
                    }));
                  }}
                >
                  <SelectTrigger className="w-full h-10">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No company</SelectItem>
                    {companyOptions
                      .filter((c) => c?.id !== undefined && c?.id !== null)
                      .map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <input
                type="hidden"
                name="companyId"
                value={form.companyId || ""}
              />
            )}

            {/* Department Select */}
            <div className="space-y-4">
              <Label>Direct Report (Department)</Label>
              <Select
                value={form.departmentId ? String(form.departmentId) : NONE}
                onValueChange={(v) => handleSelect("departmentId", v)}
              >
                <SelectTrigger className="w-full h-10">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No department</SelectItem>
                  {availableDepartments.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Business Unit Name */}
            <div className="space-y-4">
              <Label>Business Unit Name</Label>
              <Input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Operations"
              />
            </div>

            {/* Unit Head’s Name */}
            <div className="space-y-4">
              <Label>Unit Head’s Name</Label>
              <Input
                name="unitHeadName"
                value={form.unitHeadName}
                onChange={handleChange}
                placeholder="e.g. John Doe"
              />
            </div>

            {/* Unit Head’s Email */}
            <div className="space-y-4">
              <Label>Unit Head’s Email</Label>
              <Input
                type="email"
                name="unitHeadEmail"
                value={form.unitHeadEmail}
                onChange={handleChange}
                placeholder="e.g. john@company.com"
              />
            </div>

            {/* Designation */}
            <div className="space-y-4">
              <Label>Designation</Label>
              <Input
                name="designation"
                value={form.designation}
                onChange={handleChange}
                placeholder="e.g. Senior Manager"
              />
            </div>

            {/* Position */}
            <div className="space-y-4">
              <Label>Position</Label>
              <Input
                name="position"
                value={form.position}
                onChange={handleChange}
                placeholder="Unit Head"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : businessUnit ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default BusinessUnitFormModal;
