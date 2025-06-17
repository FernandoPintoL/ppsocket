const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Pizarra = sequelize.define('pizarras', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    pizarra_id: {
        type: DataTypes.INTEGER,
        unique: false,
        allowNull: true
    },
    room_id:{
        type: DataTypes.STRING,
        unique: true,
        allowNull: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        unique: true,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        defaultValue: ''
    },
    elements: {
        type: DataTypes.JSONB,
        defaultValue: []
    },
    screens: {
        type: DataTypes.JSONB,
        defaultValue: []
    },
    users:{
        type: DataTypes.JSONB,
        defaultValue: []
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
    tableName: 'pizarras',
    timestamps: true,
    underscored: true
});
// actualizar elementos de la pizarra
Pizarra.prototype.updateElements = async function(elements) {
    this.elements = elements;
    return this.save();
};
// obtener elementos de la pizarra
Pizarra.prototype.getElements = function() {
    return this.elements;
};
// obtener screens de la pizarra
Pizarra.prototype.getScreens = function() {
    return this.elements.filter(element => element.type === 'screen');
};
//obtener usuarios de la pizarra
Pizarra.prototype.getUsers = function() {
    return this.users;
};
// actualizar name de la pizarra
Pizarra.prototype.updateName = async function(name) {
    this.name = name;
    return this.save();
};
module.exports = Pizarra;
