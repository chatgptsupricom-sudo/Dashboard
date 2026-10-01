// Ejemplo conceptual del script
const checkDeadlines = async () => {
  const activities = await db.query(
    "SELECT * FROM activities WHERE status != 'culminated' AND due_date = DATE_ADD(CURDATE(), INTERVAL 3 DAY)",
  );

  activities.forEach((act) => {
    // Aquí disparas el socket para alertar al usuario y a su superior
    global.io.emit(`alert-${act.user_id}`, {
      message: `Tu tarea ${act.title} vence pronto`,
    });
    global.io.emit(`alert-manager-${act.role_id}`, {
      message: `La tarea de ${act.user_name} está por vencer`,
    });
  });
};
