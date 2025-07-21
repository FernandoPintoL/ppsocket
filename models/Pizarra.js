const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Pizarra = sequelize.define('pizarras', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    room_id:{
        type: DataTypes.STRING,
        unique: true,
        allowNull: true
    },
    name: {
        type: DataTypes.STRING,
        defaultValue: ''
    },
    users:{
        type: DataTypes.JSONB,
        defaultValue: []
    },
    isHome:{
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'isHome'
    },
    elements: {
        type: DataTypes.JSONB,
        defaultValue: []
    },
    screens: {
        type: DataTypes.JSONB,
        defaultValue: []
    },
    type: {
        type: DataTypes.STRING,
        defaultValue: 'unified'
    },
    framework: {
        type: DataTypes.STRING,
        defaultValue: 'flutter'
    },
    description: {
        type: DataTypes.STRING,
        defaultValue: ''
    },
    pizarra_id: {
        type: DataTypes.INTEGER,
        unique: false,
        allowNull: true
    },
    user_id: {
        type: DataTypes.INTEGER,
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
// actualizar name de la pizarra
Pizarra.prototype.updateName = async function(name) {
    this.name = name;
    return this.save();
};
module.exports = Pizarra;
