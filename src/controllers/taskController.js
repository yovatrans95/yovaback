const Task = require('../models/Task');

function actorFromReq(req) {
  const u = req.user;
  return {
    user: u._id,
    username: u.username || u.email || '',
    nom: u.nom || '',
    prenom: u.prenom || '',
    role: u.role || '',
    at: new Date()
  };
}

function cleanPayload(body) {
  const payload = {};
  const allowed = ['title', 'description', 'category', 'priority', 'status', 'dueDate', 'assignedTo', 'source', 'ai'];

  for (const key of allowed) {
    if (body[key] !== undefined) payload[key] = body[key];
  }

  if (payload.dueDate === '') payload.dueDate = null;
  if (payload.assignedTo === '') payload.assignedTo = null;

  return payload;
}

function addHistory(task, { action, fromStatus = null, toStatus = null, note = '', by }) {
  task.history.push({ action, fromStatus, toStatus, note, by, at: new Date() });
}

async function listTasks(req, res) {
  const { q, status, priority, assignedTo, mine } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (assignedTo) filter.assignedTo = assignedTo;

  // mine=created | assigned | handled | completed
  if (mine === 'created') filter['createdBy.user'] = req.user._id;
  if (mine === 'assigned') filter.assignedTo = req.user._id;
  if (mine === 'handled') filter['handledBy.user'] = req.user._id;
  if (mine === 'completed') filter['completion.completedBy.user'] = req.user._id;

  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { 'source.mail.subject': { $regex: q, $options: 'i' } },
      { 'source.mail.fromEmail': { $regex: q, $options: 'i' } }
    ];
  }

  const tasks = await Task.find(filter)
    .populate('assignedTo', 'username email nom prenom role avatar')
    .sort({ createdAt: -1 });

  res.json(tasks);
}

async function getTask(req, res) {
  const task = await Task.findById(req.params.id).populate('assignedTo', 'username email nom prenom role avatar');
  if (!task) return res.status(404).json({ message: 'Tâche introuvable' });
  res.json(task);
}

async function createTask(req, res) {
  const actor = actorFromReq(req);
  const payload = cleanPayload(req.body);

  if (!payload.title) {
    return res.status(400).json({ message: 'Le titre est obligatoire' });
  }

  const task = new Task({
    ...payload,
    status: payload.status || 'TODO',
    createdBy: actor
  });

  addHistory(task, {
    action: 'CREATED',
    toStatus: task.status,
    note: 'Tâche créée',
    by: actor
  });

  await task.save();
  res.status(201).json(task);
}

async function updateTask(req, res) {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Tâche introuvable' });

  const actor = actorFromReq(req);
  const previousStatus = task.status;
  const payload = cleanPayload(req.body);

  Object.assign(task, payload);

  if (payload.status && payload.status !== previousStatus) {
    addHistory(task, {
      action: 'STATUS_CHANGED',
      fromStatus: previousStatus,
      toStatus: payload.status,
      note: 'Statut modifié',
      by: actor
    });
  } else {
    addHistory(task, {
      action: 'UPDATED',
      fromStatus: previousStatus,
      toStatus: task.status,
      note: 'Tâche modifiée',
      by: actor
    });
  }

  await task.save();
  res.json(task);
}

async function validateTask(req, res) {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Tâche introuvable' });

  const actor = actorFromReq(req);
  const previousStatus = task.status;

  task.status = 'TODO';
  task.validatedBy = actor;
  task.validatedAt = new Date();

  addHistory(task, {
    action: 'VALIDATED',
    fromStatus: previousStatus,
    toStatus: 'TODO',
    note: req.body.note || 'Tâche validée',
    by: actor
  });

  await task.save();
  res.json(task);
}

async function startTask(req, res) {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Tâche introuvable' });

  const actor = actorFromReq(req);
  const previousStatus = task.status;

  task.status = 'IN_PROGRESS';
  task.handledBy = actor;
  task.handledAt = new Date();

  addHistory(task, {
    action: 'STARTED',
    fromStatus: previousStatus,
    toStatus: 'IN_PROGRESS',
    note: req.body.note || 'Tâche prise en charge',
    by: actor
  });

  await task.save();
  res.json(task);
}

async function completeTask(req, res) {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Tâche introuvable' });

  const actor = actorFromReq(req);
  const previousStatus = task.status;
  const completionNote = req.body.completionNote || req.body.note || '';

  task.status = 'DONE';
  task.completion = {
    completedBy: actor,
    completedAt: new Date(),
    completionNote
  };

  // Si personne ne l’avait prise en charge avant, celui qui termine devient aussi le traité par.
  if (!task.handledBy || !task.handledBy.user) {
    task.handledBy = actor;
    task.handledAt = new Date();
  }

  addHistory(task, {
    action: 'COMPLETED',
    fromStatus: previousStatus,
    toStatus: 'DONE',
    note: completionNote || 'Tâche terminée',
    by: actor
  });

  await task.save();
  res.json(task);
}

async function deleteTask(req, res) {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Tâche introuvable' });
  await task.deleteOne();
  res.json({ message: 'Tâche supprimée' });
}

async function getTaskStats(req, res) {
  const [total, todo, inProgress, done, waiting, toValidate] = await Promise.all([
    Task.countDocuments(),
    Task.countDocuments({ status: 'TODO' }),
    Task.countDocuments({ status: 'IN_PROGRESS' }),
    Task.countDocuments({ status: 'DONE' }),
    Task.countDocuments({ status: 'WAITING' }),
    Task.countDocuments({ status: 'TO_VALIDATE' })
  ]);

  res.json({ total, todo, inProgress, done, waiting, toValidate });
}

module.exports = {
  listTasks,
  getTask,
  createTask,
  updateTask,
  validateTask,
  startTask,
  completeTask,
  deleteTask,
  getTaskStats
};
