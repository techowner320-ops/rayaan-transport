// Shared data model: used by the server (to build tables, validate and query)
// and by the browser (to draw tables and forms). Add a field here and it
// appears everywhere.

const CURRENCY_CODES = ['USD', 'GBP', 'SLSH'];
const PAY_METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque'];

export const ENTITIES = {
  vehicles: {
    title: 'Vehicles',
    singular: 'Vehicle',
    orderBy: 'name ASC',
    fields: [
      { key: 'name', label: 'Vehicle Name / Type', type: 'text', required: true },
      { key: 'plate', label: 'License Plate No.', type: 'text', required: true },
      { key: 'ownership', label: 'Ownership', type: 'select', options: ['Company-Owned', 'Rented'], required: true },
      { key: 'driver_name', label: 'Driver Name', type: 'text' },
      { key: 'driver_phone', label: 'Driver Telephone', type: 'tel' },
      { key: 'status', label: 'Status', type: 'select', options: ['Available', 'Working', 'Under Maintenance'], required: true, default: 'Available' },
      { key: 'service_date', label: 'Employment / Service Date', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: ['name', 'plate', 'ownership', 'driver_name', 'driver_phone', 'status', 'service_date'],
  },

  clients: {
    title: 'Clients',
    singular: 'Client',
    orderBy: 'name ASC',
    fields: [
      { key: 'name', label: 'Client Name', type: 'text', required: true },
      { key: 'type', label: 'Type', type: 'select', options: ['UN Agency', 'INGO', 'NGO', 'Government', 'Private Company', 'Individual', 'Other'] },
      { key: 'contact_person', label: 'Contact Person', type: 'text' },
      { key: 'phone', label: 'Telephone', type: 'tel' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'address', label: 'Address / Office', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: ['name', 'type', 'contact_person', 'phone', 'email'],
  },

  missions: {
    title: 'Missions',
    singular: 'Mission',
    dateField: 'start_date',
    sumField: 'amount',
    fields: [
      { key: 'client_id', label: 'Client', type: 'ref', ref: 'clients', required: true },
      { key: 'vehicle_id', label: 'Vehicle', type: 'ref', ref: 'vehicles', required: true },
      { key: 'start_date', label: 'Start Date', type: 'date', required: true },
      { key: 'end_date', label: 'End Date', type: 'date' },
      { key: 'origin', label: 'From', type: 'text', required: true },
      { key: 'destination', label: 'To', type: 'text', required: true },
      { key: 'cargo', label: 'Cargo / Description', type: 'text' },
      { key: 'amount', label: 'Contract Amount (Revenue)', type: 'money', required: true },
      { key: 'currency', label: 'Currency', type: 'currency', required: true, options: CURRENCY_CODES },
      { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Ongoing', 'Completed', 'Cancelled'], required: true, default: 'Planned', hint: 'Revenue counts once a mission is Completed.' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: ['id', 'start_date', 'client_id', 'vehicle_id', 'origin', 'destination', 'amount', 'status'],
  },

  fuel: {
    title: 'Fuel',
    singular: 'Fuel Record',
    dateField: 'date',
    sumField: 'cost',
    fields: [
      { key: 'vehicle_id', label: 'Vehicle', type: 'ref', ref: 'vehicles', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'mission_id', label: 'Mission (optional)', type: 'ref', ref: 'missions' },
      { key: 'liters', label: 'Liters', type: 'number' },
      { key: 'cost', label: 'Total Cost', type: 'money', required: true },
      { key: 'currency', label: 'Currency', type: 'currency', required: true, options: CURRENCY_CODES },
      { key: 'odometer', label: 'Odometer (km)', type: 'number' },
      { key: 'station', label: 'Fuel Station', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: ['date', 'vehicle_id', 'mission_id', 'liters', 'cost', 'odometer', 'station'],
  },

  maintenance: {
    title: 'Maintenance',
    singular: 'Maintenance Record',
    dateField: 'date',
    sumField: 'cost',
    fields: [
      { key: 'vehicle_id', label: 'Vehicle', type: 'ref', ref: 'vehicles', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'type', label: 'Type', type: 'select', options: ['Service', 'Repair', 'Tyres', 'Spare Parts', 'Inspection', 'Other'], required: true },
      { key: 'description', label: 'Description', type: 'text', required: true },
      { key: 'cost', label: 'Cost', type: 'money', required: true },
      { key: 'currency', label: 'Currency', type: 'currency', required: true, options: CURRENCY_CODES },
      { key: 'garage', label: 'Garage / Mechanic', type: 'text' },
      { key: 'odometer', label: 'Odometer (km)', type: 'number' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: ['date', 'vehicle_id', 'type', 'description', 'cost', 'garage'],
  },

  expenses: {
    title: 'Expenses & Payments Made',
    singular: 'Expense',
    dateField: 'date',
    sumField: 'amount',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'category', label: 'Category', type: 'select', required: true, options: ['Driver Salary / Allowance', 'Vehicle Rent', 'Tyres', 'Insurance', 'Permits & Taxes', 'Checkpoints / Tolls', 'Loading / Offloading', 'Office & Admin', 'Other'] },
      { key: 'description', label: 'Description', type: 'text', required: true },
      { key: 'amount', label: 'Amount', type: 'money', required: true },
      { key: 'currency', label: 'Currency', type: 'currency', required: true, options: CURRENCY_CODES },
      { key: 'vehicle_id', label: 'Vehicle (optional)', type: 'ref', ref: 'vehicles' },
      { key: 'mission_id', label: 'Mission (optional)', type: 'ref', ref: 'missions' },
      { key: 'paid_to', label: 'Paid To', type: 'text' },
      { key: 'method', label: 'Payment Method', type: 'select', options: PAY_METHODS },
      { key: 'reference', label: 'Receipt / Reference', type: 'text' },
    ],
    columns: ['date', 'category', 'description', 'vehicle_id', 'paid_to', 'method', 'amount'],
  },

  payments: {
    title: 'Payments Received',
    singular: 'Payment Received',
    dateField: 'date',
    sumField: 'amount',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'client_id', label: 'Client', type: 'ref', ref: 'clients', required: true },
      { key: 'mission_id', label: 'Mission (optional)', type: 'ref', ref: 'missions' },
      { key: 'amount', label: 'Amount', type: 'money', required: true },
      { key: 'currency', label: 'Currency', type: 'currency', required: true, options: CURRENCY_CODES },
      { key: 'method', label: 'Payment Method', type: 'select', options: PAY_METHODS },
      { key: 'reference', label: 'Invoice / Receipt No.', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: ['date', 'client_id', 'mission_id', 'method', 'reference', 'amount'],
  },
};
