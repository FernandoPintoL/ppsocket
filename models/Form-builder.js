const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FormBuilder = sequelize.define('form_builders', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        defaultValue: ''
    },
    room_id:{
        type: DataTypes.STRING,
        unique: true,
        allowNull: true
    },
    elements: {
        type: DataTypes.JSONB,
        defaultValue: []
    },
    user_id: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
},{
    tableName: 'form_builders',
    timestamps: true,
    underscored: true
});
// actualizar elementos del formulario
FormBuilder.prototype.updateElementsFormBuilder = async function(elements, user_id) {
    this.elements = elements;
    this.updated_at = new Date();
    // Don't update user_id to avoid conflicts with unique constraint
    return this.save();
};
// actualizar nombre del formulario
FormBuilder.prototype.updateNameProyecto = async function(name, userId) {
    this.name = name;
    this.user_id = userId;
    this.updated_at = new Date();
    return this.save();
}

//actualizar room_id
FormBuilder.prototype.updateRoomId = async function(room_id) {
    this.room_id = room_id;
    this.updated_at = new Date();
    return this.save();
}

module.exports = FormBuilder;
