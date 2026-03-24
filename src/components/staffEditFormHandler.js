//  form submission forStaffRecord fields
const handleSubmit = async (formData) => {
  // Prepare payload 
  const payload = {};
  
  // 1. Personal Information
  if (formData.firstName !== originalData.firstName) {
    payload.firstName = formData.firstName;
  }
  
  if (formData.lastName !== originalData.lastName) {
    payload.lastName = formData.lastName;
  }
  
  if (formData.email !== originalData.email) {
    payload.email = formData.email;
  }
  
  // 2. Employment Details
  if (formData.department !== originalData.department) {
    payload.department = formData.department;
  }
  
  if (formData.position !== originalData.position) {
    payload.position = formData.position;
  }
  
  if (formData.role !== originalData.role) {
    payload.role = formData.role;
  }
  
  // 3. Contact Information (optional fields)
  if (formData.phone === '') {
    payload.phone = null;
  } else if (formData.phone !== originalData.phone) {
    payload.phone = formData.phone;
  }
  
  // 4. Bank Details (optional fields)
  if (formData.bankName === '') {
    payload.bankName = null;
  } else if (formData.bankName !== originalData.bankName) {
    payload.bankName = formData.bankName;
  }
  
  if (formData.accountNumber === '') {
    payload.accountNumber = null;
  } else if (formData.accountNumber !== originalData.accountNumber) {
    payload.accountNumber = formData.accountNumber;
  }
  
  if (formData.bvn === '') {
    payload.bvn = null;
  } else if (formData.bvn !== originalData.bvn) {
    payload.bvn = formData.bvn;
  }
  
  // 5. Status Flags
  if (formData.isRegistered !== originalData.isRegistered) {
    payload.isRegistered = formData.isRegistered;
  }
  
  if (formData.isActive !== originalData.isActive) {
    payload.isActive = formData.isActive;
  }
  
  // 6. Encoded ID (optional)
  if (formData.encodedId === '') {
    payload.encodedId = null;
  } else if (formData.encodedId !== originalData.encodedId) {
    payload.encodedId = formData.encodedId;
  }
  
  // Check if any fields changed
  if (Object.keys(payload).length === 0) {
    return {
      success: false,
      error: 'No changes detected',
      statusCode: 201
    };
  }
  
  try {
    // Submit to API
    const response = await fetch(`/api/admin/staff/edit/${staffId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Network error',
      statusCode: 0
    };
  }
};