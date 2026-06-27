// Load services on page load
document.addEventListener('DOMContentLoaded', function() {
    loadServices();
    setMinDate();
    
    // Setup event listeners
    const form = document.getElementById('appointmentForm');
    if (form) {
        form.addEventListener('submit', handleAppointmentSubmit);
    }
    
    const dateInput = document.getElementById('appointment_date');
    if (dateInput) {
        dateInput.addEventListener('change', loadAvailableSlots);
    }
    
    const serviceSelect = document.getElementById('service_id');
    if (serviceSelect) {
        serviceSelect.addEventListener('change', loadAvailableSlots);
    }
    
    const filterDate = document.getElementById('filterDate');
    if (filterDate) {
        filterDate.addEventListener('change', loadAppointments);
    }
    
    const clearFilter = document.getElementById('clearFilter');
    if (clearFilter) {
        clearFilter.addEventListener('click', function() {
            document.getElementById('filterDate').value = '';
            loadAppointments();
        });
    }
    
    const refreshBtn = document.getElementById('refreshAppointments');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadAppointments);
    }
    
    // Load appointments on appointments page
    if (window.location.pathname.includes('/appointments')) {
        loadAppointments();
    }
});

// Set minimum date to today
function setMinDate() {
    const dateInput = document.getElementById('appointment_date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.setAttribute('min', today);
    }
}

// Load services from API
function loadServices() {
    fetch('/api/services')
        .then(response => response.json())
        .then(services => {
            const select = document.getElementById('service_id');
            if (select) {
                // Keep the first option
                select.innerHTML = '<option value="">Choose a service...</option>';
                services.forEach(service => {
                    const option = document.createElement('option');
                    option.value = service.id;
                    option.textContent = `${service.name} - ${service.duration} min ($${service.price})`;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error loading services:', error));
}

// Load available time slots
function loadAvailableSlots() {
    const date = document.getElementById('appointment_date').value;
    const serviceId = document.getElementById('service_id').value;
    const timeSelect = document.getElementById('appointment_time');
    
    if (!date || !serviceId) {
        timeSelect.innerHTML = '<option value="">Select service and date first...</option>';
        return;
    }
    
    fetch(`/api/available-slots?date=${date}&service_id=${serviceId}`)
        .then(response => response.json())
        .then(slots => {
            timeSelect.innerHTML = '<option value="">Choose a time...</option>';
            slots.forEach(slot => {
                const option = document.createElement('option');
                const time = new Date(slot.time);
                const timeStr = time.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                option.value = slot.time;
                option.textContent = slot.available ? timeStr : `${timeStr} (Booked)`;
                option.disabled = !slot.available;
                timeSelect.appendChild(option);
            });
        })
        .catch(error => console.error('Error loading slots:', error));
}

// Handle appointment form submission
function handleAppointmentSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const appointmentData = {
        user_name: formData.get('user_name'),
        user_email: formData.get('user_email'),
        user_phone: formData.get('user_phone') || '',
        service_id: parseInt(formData.get('service_id')),
        appointment_date: formData.get('appointment_time'),
        notes: formData.get('notes') || ''
    };
    
    // Validate
    if (!appointmentData.user_name || !appointmentData.user_email || 
        !appointmentData.service_id || !appointmentData.appointment_date) {
        showAlert('Please fill all required fields', 'error');
        return;
    }
    
    // Submit to API
    fetch('/api/appointments', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(appointmentData)
    })
    .then(response => response.json())
    .then(data => {
        if (response.ok) {
            showAlert('Appointment booked successfully!', 'success');
            e.target.reset();
            loadAvailableSlots();
        } else {
            showAlert(data.error || 'Error booking appointment', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('Error booking appointment', 'error');
    });
}

// Load appointments list
function loadAppointments() {
    const container = document.getElementById('appointmentsContainer');
    if (!container) return;
    
    const filterDate = document.getElementById('filterDate');
    let url = '/api/appointments';
    if (filterDate && filterDate.value) {
        url += `?date=${filterDate.value}`;
    }
    
    container.innerHTML = '<div class="loading">Loading appointments...</div>';
    
    fetch(url)
        .then(response => response.json())
        .then(appointments => {
            if (appointments.length === 0) {
                container.innerHTML = '<div class="alert alert-info">No appointments found</div>';
                return;
            }
            
            let html = '';
            appointments.forEach(app => {
                const date = new Date(app.appointment_date);
                const dateStr = date.toLocaleDateString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                const timeStr = date.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                const statusClass = `status-${app.status.toLowerCase()}`;
                
                html += `
                    <div class="appointment-card" data-id="${app.id}">
                        <div class="appointment-header">
                            <h4>${app.user_name} - ${app.service_name}</h4>
                            <span class="status-badge ${statusClass}">${app.status}</span>
                        </div>
                        <div class="appointment-details">
                            <span>📅 ${dateStr}</span>
                            <span>⏰ ${timeStr}</span>
                            <span>📧 ${app.user_id ? 'Registered User' : 'Guest'}</span>
                        </div>
                        ${app.notes ? `<p><strong>Notes:</strong> ${app.notes}</p>` : ''}
                        <div class="appointment-actions">
                            ${app.status === 'Scheduled' ? `
                                <button onclick="completeAppointment(${app.id})" class="btn btn-success btn-small">Complete</button>
                                <button onclick="cancelAppointment(${app.id})" class="btn btn-danger btn-small">Cancel</button>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading appointments:', error);
            container.innerHTML = '<div class="alert alert-error">Error loading appointments</div>';
        });
}

// Complete appointment
function completeAppointment(id) {
    if (!confirm('Mark this appointment as completed?')) return;
    
    fetch(`/api/appointments/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'Completed' })
    })
    .then(response => response.json())
    .then(data => {
        showAlert('Appointment completed successfully', 'success');
        loadAppointments();
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('Error completing appointment', 'error');
    });
}

// Cancel appointment
function cancelAppointment(id) {
    if (!confirm('Cancel this appointment?')) return;
    
    fetch(`/api/appointments/${id}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        showAlert('Appointment cancelled successfully', 'success');
        loadAppointments();
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('Error cancelling appointment', 'error');
    });
}

// Show alert message
function showAlert(message, type = 'info') {
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    const form = document.getElementById('appointmentForm');
    if (form) {
        form.insertBefore(alertDiv, form.firstChild);
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            alertDiv.remove();
        }, 5000);
    } else {
        // For appointments page
        const container = document.getElementById('appointmentsContainer');
        if (container) {
            container.insertBefore(alertDiv, container.firstChild);
        }
    }
}
