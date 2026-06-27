from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
from flask_migrate import Migrate
import os
import json

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///appointments.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
migrate = Migrate(app, db)

# Database Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    appointments = db.relationship('Appointment', backref='user', lazy=True)

class Service(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    duration = db.Column(db.Integer, nullable=False)  # Duration in minutes
    price = db.Column(db.Float, nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    appointments = db.relationship('Appointment', backref='service', lazy=True)

class Appointment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    service_id = db.Column(db.Integer, db.ForeignKey('service.id'), nullable=False)
    appointment_date = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.String(20), default='Scheduled')  # Scheduled, Completed, Cancelled
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Initialize database with sample data
def init_db():
    with app.app_context():
        db.create_all()
        
        # Check if services exist
        if Service.query.count() == 0:
            services = [
                Service(name='Consultation', description='General consultation', duration=30, price=50.00),
                Service(name='Check-up', description='Complete medical check-up', duration=60, price=100.00),
                Service(name='Follow-up', description='Follow-up appointment', duration=20, price=35.00),
                Service(name='Specialist Visit', description='Visit with specialist', duration=45, price=75.00),
            ]
            for service in services:
                db.session.add(service)
            db.session.commit()

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/appointments')
def appointments():
    return render_template('appointments.html')

@app.route('/api/services', methods=['GET'])
def get_services():
    services = Service.query.filter_by(is_active=True).all()
    return jsonify([{
        'id': s.id,
        'name': s.name,
        'description': s.description,
        'duration': s.duration,
        'price': s.price
    } for s in services])

@app.route('/api/appointments', methods=['GET'])
def get_appointments():
    date_str = request.args.get('date')
    if date_str:
        date = datetime.strptime(date_str, '%Y-%m-%d').date()
        appointments = Appointment.query.filter(
            db.func.date(Appointment.appointment_date) == date
        ).all()
    else:
        appointments = Appointment.query.all()
    
    return jsonify([{
        'id': a.id,
        'user_id': a.user_id,
        'user_name': a.user.name,
        'service_id': a.service_id,
        'service_name': a.service.name,
        'appointment_date': a.appointment_date.isoformat(),
        'status': a.status,
        'notes': a.notes
    } for a in appointments])

@app.route('/api/appointments', methods=['POST'])
def create_appointment():
    try:
        data = request.json
        user_name = data.get('user_name')
        user_email = data.get('user_email')
        user_phone = data.get('user_phone', '')
        service_id = data.get('service_id')
        appointment_date = datetime.fromisoformat(data.get('appointment_date'))
        notes = data.get('notes', '')

        # Check if user exists, if not create one
        user = User.query.filter_by(email=user_email).first()
        if not user:
            user = User(name=user_name, email=user_email, phone=user_phone)
            db.session.add(user)
            db.session.flush()

        # Check for conflicting appointments
        existing = Appointment.query.filter(
            Appointment.appointment_date == appointment_date,
            Appointment.status != 'Cancelled'
        ).first()
        
        if existing:
            return jsonify({'error': 'Time slot already booked'}), 400

        # Create appointment
        appointment = Appointment(
            user_id=user.id,
            service_id=service_id,
            appointment_date=appointment_date,
            notes=notes
        )
        db.session.add(appointment)
        db.session.commit()

        return jsonify({
            'message': 'Appointment created successfully',
            'appointment_id': appointment.id
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/appointments/<int:appointment_id>', methods=['PUT'])
def update_appointment(appointment_id):
    try:
        appointment = Appointment.query.get_or_404(appointment_id)
        data = request.json
        
        if 'status' in data:
            appointment.status = data['status']
        if 'notes' in data:
            appointment.notes = data['notes']
        if 'appointment_date' in data:
            appointment.appointment_date = datetime.fromisoformat(data['appointment_date'])
        
        db.session.commit()
        return jsonify({'message': 'Appointment updated successfully'})
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/appointments/<int:appointment_id>', methods=['DELETE'])
def delete_appointment(appointment_id):
    try:
        appointment = Appointment.query.get_or_404(appointment_id)
        appointment.status = 'Cancelled'
        db.session.commit()
        return jsonify({'message': 'Appointment cancelled successfully'})
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/available-slots', methods=['GET'])
def get_available_slots():
    date_str = request.args.get('date')
    service_id = request.args.get('service_id')
    
    if not date_str or not service_id:
        return jsonify({'error': 'Date and service_id are required'}), 400
    
    date = datetime.strptime(date_str, '%Y-%m-%d').date()
    service = Service.query.get(service_id)
    
    if not service:
        return jsonify({'error': 'Service not found'}), 404
    
    # Generate time slots (9 AM to 5 PM)
    slots = []
    start_time = datetime(date.year, date.month, date.day, 9, 0)
    end_time = datetime(date.year, date.month, date.day, 17, 0)
    
    current_time = start_time
    while current_time < end_time:
        # Check if slot is available
        existing = Appointment.query.filter(
            Appointment.appointment_date == current_time,
            Appointment.status != 'Cancelled'
        ).first()
        
        if not existing:
            slots.append({
                'time': current_time.isoformat(),
                'available': True
            })
        else:
            slots.append({
                'time': current_time.isoformat(),
                'available': False
            })
        
        current_time += timedelta(minutes=service.duration)
    
    return jsonify(slots)

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)
