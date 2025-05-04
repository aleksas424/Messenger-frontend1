import { useState, useEffect } from 'react';
import axios from 'axios';

export default function AddMemberModal({ chatId, onClose, onAdded }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState([]);

  useEffect(() => {
    // Fetch current members
    axios.get(`http://5.199.169.195:5000/api/group/${chatId}/members`)
      .then(res => setMembers(res.data.map(m => m.id)));
    // Fetch all users
    axios.get(`http://5.199.169.195:5000/api/users`)
      .then(res => setUsers(res.data));
  }, [chatId]);

  const toggleUser = (id) => {
    setSelected(sel => sel.includes(id) ? sel.filter(i => i !== id) : [...sel, id]);
  };

  const handleAdd = async () => {
    for (const userId of selected) {
      await axios.post(`http://5.199.169.195:5000/api/group/${chatId}/members`, { userId });
    }
    onAdded();
    onClose();
  };

  // Filter users: only those not already members, and match search
  const filteredUsers = users.filter(u =>
    !members.includes(u.id) &&
    (u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Pridėti narį</h3>
        <input
          className="w-full mb-4 px-3 py-2 border rounded"
          placeholder="Ieškoti vartotojų..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="mb-4 max-h-48 overflow-y-auto">
          {filteredUsers.map(u => (
            <div key={u.id} className="flex items-center gap-2 mb-1">
              <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggleUser(u.id)} />
              <span>{u.name}</span>
            </div>
          ))}
          {filteredUsers.length === 0 && <div className="text-gray-400 text-sm">Nėra vartotojų</div>}
        </div>
        <div className="flex gap-2 mt-4">
          <button className="bg-primary-500 text-white px-4 py-2 rounded" onClick={handleAdd} disabled={selected.length === 0}>Pridėti</button>
          <button className="bg-gray-300 px-4 py-2 rounded" onClick={onClose}>Atšaukti</button>
        </div>
      </div>
    </div>
  );
} 