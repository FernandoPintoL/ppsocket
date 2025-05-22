const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PizarraCollaborators = sequelize.define('pizarra_collaborators', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    pizarra_id:{
        type: DataTypes.INTEGER,
        allowNull: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: ''
    },
},{
    tableName: 'pizarra_collaborators',
    timestamps: true,
    underscored: true
});
// registrar colaborador
PizarraCollaborators.prototype.registerCollaborator = async function(pizarraId, userId, status) {
    this.pizarra_id = pizarraId;
    this.user_id = userId;
    this.status = status;
    return this.save();
};
module.exports = PizarraCollaborators;
