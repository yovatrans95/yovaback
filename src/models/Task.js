const mongoose = require('mongoose');

const actorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    username: { type: String, default: '' },
    nom: { type: String, default: '' },
    prenom: { type: String, default: '' },
    role: { type: String, default: '' },
    at: { type: Date, default: null }
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    note: { type: String, default: '' },
    by: { type: actorSchema, default: null },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    category: {
      type: String,
      enum: ['REPLY_EMAIL', 'VERIFY_INVOICE', 'FOLLOW_UP', 'READ_RESPONSE', 'SIGN_DOCUMENT', 'SEND_DOCUMENT', 'CHECK_ATTACHMENT', 'CONFIRM_INFO', 'OTHER'],
      default: 'OTHER'
    },
    priority: { type: String, enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], default: 'NORMAL' },
    status: { type: String, enum: ['TO_VALIDATE', 'TODO', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED'], default: 'TODO' },
    dueDate: { type: Date, default: null },

    // Qui a créé la tâche depuis son compte connecté
    createdBy: { type: actorSchema, default: null },

    // Pour plus tard : assignation à un utilisateur précis
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Qui a validé la tâche
    validatedBy: { type: actorSchema, default: null },
    validatedAt: { type: Date, default: null },

    // Qui a pris la tâche en charge / qui la traite
    handledBy: { type: actorSchema, default: null },
    handledAt: { type: Date, default: null },

    // Qui a déclaré la tâche terminée
    completion: {
      completedBy: { type: actorSchema, default: null },
      completedAt: { type: Date, default: null },
      completionNote: { type: String, default: '' }
    },

    source: {
      type: { type: String, default: 'MANUAL' },
      originalText: { type: String, default: '' },
      mail: {
        mailbox: { type: String, default: '' },
        fromEmail: { type: String, default: '' },
        fromName: { type: String, default: '' },
        subject: { type: String, default: '' },
        receivedAt: { type: Date, default: null }
      }
    },

    ai: {
      summary: { type: String, default: '' },
      suggestedAction: { type: String, default: '' },
      suggestedReply: { type: String, default: '' },
      requiresReply: { type: Boolean, default: false },
      requiresDocument: { type: Boolean, default: false },
      requiresSignature: { type: Boolean, default: false },
      confidence: { type: Number, default: null }
    },

    history: { type: [historySchema], default: [] }
  },
  { timestamps: true }
);

taskSchema.index({ status: 1, priority: 1, dueDate: 1 });
taskSchema.index({ 'createdBy.user': 1 });
taskSchema.index({ assignedTo: 1 });
taskSchema.index({ 'handledBy.user': 1 });
taskSchema.index({ 'completion.completedBy.user': 1 });

module.exports = mongoose.model('Task', taskSchema);
