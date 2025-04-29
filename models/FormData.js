const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FormData = sequelize.define('form_data', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    room_id: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    elements: {
        type: DataTypes.JSONB,
        defaultValue: []
    },
    name: {
        type: DataTypes.STRING,
        defaultValue: ''
    },
    last_updated: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    last_updated_by: {
        type: DataTypes.STRING,
        defaultValue: 'system'
    }
}, {
    tableName: 'form_data',
    timestamps: true,
    underscored: true
});

// Método para actualizar los elementos del formulario
FormData.prototype.updateElements = async function(elements, user) {
    this.elements = elements;
    this.last_updated = new Date();
    this.last_updated_by = user;
    return this.save();
};

// Método para actualizar el nombre del formulario
FormData.prototype.updateName = async function(name, user) {
    this.name = name;
    this.last_updated = new Date();
    this.last_updated_by = user;
    return this.save();
};

module.exports = FormData; 