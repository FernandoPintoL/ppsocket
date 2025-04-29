const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = sequelize.define('form_builders', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        defaultValue: ''
    },
    email: {
        type: DataTypes.TEXT,
        defaultValue: ''
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updated_at: {
        type: DataTypes.STRING,
        defaultValue: 'system'
    }
},{
    tableName: 'users',
    timestamps: true,
    underscored: true
});

module.exports = User;