export const calculateConsolidatedRelief = (annualGrossPay: number): number => {
  const relief1 = annualGrossPay * 0.2
  const relief2 = 200000
  return Math.max(relief1, relief2)
}

export const calculatePayee = (taxableIncome: number): number => {
  if (taxableIncome <= 300000) {
    return taxableIncome * 0.07
  } else if (taxableIncome <= 600000) {
    return 21000 + (taxableIncome - 300000) * 0.11
  } else if (taxableIncome <= 1100000) {
    return 54000 + (taxableIncome - 600000) * 0.15
  } else if (taxableIncome <= 1600000) {
    return 129000 + (taxableIncome - 1100000) * 0.19
  } else if (taxableIncome <= 3200000) {
    return 224000 + (taxableIncome - 1600000) * 0.21
  } else {
    return 560000 + (taxableIncome - 3200000) * 0.24
  }
}

export const calculateNigerianSalaryComponents = (proratedGrossPay: number) => {
  const basicSalary = proratedGrossPay * 0.15
  const housing = proratedGrossPay * 0.1
  const transport = proratedGrossPay * 0.1
  const dressing = proratedGrossPay * 0.15
  const leaveAllowance = proratedGrossPay * 0.15
  const entertainment = proratedGrossPay * 0.2
  const utility = proratedGrossPay * 0.2

  return {
    basicSalary,
    housing,
    transport,
    dressing,
    leaveAllowance,
    entertainment,
    utility
  }
}