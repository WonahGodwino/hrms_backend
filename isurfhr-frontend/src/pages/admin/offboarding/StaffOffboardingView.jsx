import React, { useMemo, useState } from "react";
import {
    Box,
    Typography,
    Card,
    CardContent,
    Stepper,
    Step,
    StepLabel,
    StepConnector,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Button,
    Chip,
    LinearProgress,
    Alert,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { Check as CheckIcon } from "@mui/icons-material";
import { useParams, useNavigate } from "react-router-dom";
import { mockData } from "./mock/mockData";

const steps = ["Items", "Documents", "Completed"];

const DEV_MODE = true; // change to false in production

const CustomConnector = styled(StepConnector)(() => ({
    "& .MuiStepConnector-line": {
        borderColor: "#E2E8F0",
        borderTopWidth: 3,
        borderRadius: 1,
    },
    "&.Mui-active .MuiStepConnector-line": {
        borderColor: "#1180DA",
    },
    "&.Mui-completed .MuiStepConnector-line": {
        borderColor: "#10B981",
    },
}));

function CustomStepIcon(props) {
    const { active, completed, icon } = props;

    return (
        <Box
            sx={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: completed ? "#10B981" : active ? "#1180DA" : "#E2E8F0",
                color: completed || active ? "#fff" : "#64748B",
                fontWeight: 700,
                fontSize: 14,
                transition: "all 0.3s",
            }}
        >
            {completed ? <CheckIcon sx={{ fontSize: 18 }} /> : icon}
        </Box>
    );
}

export default function StaffOffboardingView() {
    const { id } = useParams();
    const navigate = useNavigate();

    const record = useMemo(() => {
        return mockData.find((r) => r.id === id);
    }, [id]);

    const [activeStep, setActiveStep] = useState(0);
    const [error, setError] = useState("");
    const [documentsSubmitted, setDocumentsSubmitted] = useState(false);

    if (!record) {
        return (
            <Box sx={{ maxWidth: 700, mx: "auto", mt: 4 }}>
                <Typography>No record found</Typography>
            </Box>
        );
    }

    const tasks = record.tasks || [];
    const completedTasks = tasks.filter((task) => task.status === "completed").length;
    const totalTasks = tasks.length;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const allItemsCompleted = tasks.length > 0 && tasks.every((task) => task.status === "completed");

    const handleProceed = () => {
        if (!DEV_MODE) {
            if (activeStep === 0 && !allItemsCompleted) {
                setError("Complete all items before continuing.");
                return;
            }

            if (activeStep === 1 && !documentsSubmitted) {
                setError("Submit required documents before continuing.");
                return;
            }
        }

        setError("");

        if (activeStep < steps.length - 1) {
            setActiveStep((prev) => prev + 1);
        }
    };

    const getStatusChip = (status) => {
        switch (status) {
            case "completed":
                return <Chip label="Completed" color="success" size="small" />;
            case "in-progress":
                return <Chip label="In Progress" color="info" size="small" />;
            case "pending":
            default:
                return <Chip label="Pending" color="warning" size="small" />;
        }
    };

    return (
        <Box sx={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            maxWidth: 900,
            mx: "auto",
        }}>

            {/* STEP 1 — Stepper now outside the card */}
            <Stepper activeStep={activeStep} connector={<CustomConnector />} sx={{ my: 5 }}>
                {steps.map((label) => (
                    <Step key={label}>
                        <StepLabel slots={{ stepIcon: CustomStepIcon }}>
                            <Typography variant="caption" fontWeight={600}>
                                {label}
                            </Typography>
                        </StepLabel>
                    </Step>
                ))}
            </Stepper>


            <Card sx={{ borderRadius: 3 }}>
                <CardContent>
                    <Typography variant="h5" fontWeight={700} mb={1}>
                        My Offboarding Progress
                    </Typography>

                    <Typography variant="body2" color="text.secondary" mb={3}>
                        Track your offboarding items and required submissions.
                    </Typography>

                    <Box sx={{ mb: 4 }}>
                        <Typography variant="body2" fontWeight={600} mb={1}>
                            Progress: {progress}%
                        </Typography>
                        <LinearProgress
                            variant="determinate"
                            value={progress}
                            sx={{
                                height: 8,
                                borderRadius: 4,
                                bgcolor: "#E2E8F0",
                                "& .MuiLinearProgress-bar": {
                                    borderRadius: 4,
                                    bgcolor: progress === 100 ? "#10B981" : "#1180DA",
                                },
                            }}
                        />
                    </Box>

                    {error && (
                        <Alert severity="warning" sx={{ mb: 3 }}>
                            {error}
                        </Alert>
                    )}

                    {activeStep === 0 && (
                        <>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Items</TableCell>
                                        <TableCell>Submission</TableCell>
                                        <TableCell>Status</TableCell>
                                    </TableRow>
                                </TableHead>

                                <TableBody>
                                    {tasks.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={3} align="center">
                                                No tasks available
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        tasks.map((task) => (
                                            <TableRow key={task.id}>
                                                <TableCell>{task.title}</TableCell>

                                                <TableCell>
                                                    {task.status === "completed" ? "✔ Completed" : "Not submitted"}
                                                </TableCell>

                                                <TableCell>{getStatusChip(task.status)}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>

                            <Box sx={{ mt: 2 }}>
                                <Typography
                                    variant="body2"
                                    color={allItemsCompleted ? "success.main" : "warning.main"}
                                >
                                    {allItemsCompleted
                                        ? "All required items are completed."
                                        : `Complete all items to continue (${completedTasks}/${totalTasks} done).`}
                                </Typography>
                            </Box>

                            <Box sx={{ mt: 4, textAlign: "center" }}>
                                <Button
                                    variant="contained"
                                    size="large"
                                    onClick={handleProceed}
                                    disabled={!DEV_MODE && !allItemsCompleted}
                                >
                                    Proceed
                                </Button>
                            </Box>
                        </>
                    )}

                    {activeStep === 1 && (
                        <Box textAlign="center">
                            <Typography variant="h6" mb={2}>
                                Upload required documents
                            </Typography>

                            <Typography variant="body2" color="text.secondary" mb={2}>
                                You must submit the required documents before continuing.
                            </Typography>

                            <Button
                                variant="outlined"
                                sx={{ mb: 2 }}
                                onClick={() => {
                                    setDocumentsSubmitted(true);
                                    setError("");
                                }}
                            >
                                Mark Documents as Submitted
                            </Button>

                            <Box sx={{ mb: 3 }}>
                                <Chip
                                    label={documentsSubmitted ? "Documents Submitted" : "Documents Pending"}
                                    color={documentsSubmitted ? "success" : "warning"}
                                    size="small"
                                />
                            </Box>

                            <Button
                                variant="contained"
                                onClick={handleProceed}
                                disabled={!DEV_MODE && !documentsSubmitted}
                            >
                                Continue
                            </Button>
                        </Box>
                    )}

                    {activeStep === 2 && (
                        <Box textAlign="center">
                            <Typography variant="h5" fontWeight={700} mb={2}>
                                Submission Successful
                            </Typography>

                            <Button variant="contained" onClick={() => navigate("/offboarding")}>
                                Finish
                            </Button>
                        </Box>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
}