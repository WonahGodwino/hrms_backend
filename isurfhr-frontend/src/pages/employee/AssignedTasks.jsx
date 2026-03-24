// (Employee View)
import React from "react";

const AssignedTasks = () => {
  const tasks = [
    {
      id: 1,
      title: "Prepare Sales Report",
      status: "In Progress",
      due: "2025-08-20",
    },
    {
      id: 2,
      title: "Update Client Database",
      status: "Pending",
      due: "2025-08-18",
    },
    {
      id: 3,
      title: "Organize Product Launch",
      status: "Completed",
      due: "2025-08-10",
    },
  ];

  return (
    <div className="min-h-screen px-6 py-8 font-montserrat">
      <h1 className="text-2xl font-bold text-[#1180DA] mb-6">
        My Assigned Tasks
      </h1>

      <div className="mb-4 flex items-center justify-between">
        <input
          type="text"
          placeholder="Search tasks..."
          className="border border-gray-300 rounded-lg px-3 py-2 w-1/3"
        />
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3">Task</th>
              <th className="p-3">Status</th>
              <th className="p-3">Due Date</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="border-t">
                <td className="p-3">{task.title}</td>
                <td className="p-3">{task.status}</td>
                <td className="p-3">{task.due}</td>
                <td className="p-3">
                  <button className="bg-green-500 text-white px-3 py-1 rounded-lg mr-2">
                    Mark Complete
                  </button>
                  <button className="bg-blue-500 text-white px-3 py-1 rounded-lg">
                    Update Progress
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AssignedTasks;
