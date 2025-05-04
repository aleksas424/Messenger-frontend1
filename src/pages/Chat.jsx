import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { io } from 'socket.io-client';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import CreateGroupOrChannelModal from '../components/CreateGroupOrChannelModal';
import AddMemberModal from '../components/AddMemberModal';

const typeIcon = {
  private: '💬',
  group: '👥',
  channel: '📢',
};

const Chat = () => {
  const { user } = useAuth();
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState({});
  const [search, setSearch] = useState('');
  const socket = useRef();
  const messagesEndRef = useRef();
  const [members, setMembers] = useState([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showUserSelect, setShowUserSelect] = useState(false);
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreateGroupOrChannel, setShowCreateGroupOrChannel] = useState(false);
  const [createType, setCreateType] = useState(null);
  const [showAddMember, setShowAddMember] = useState(false);

  useEffect(() => {
    // Initialize socket connection
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    socket.current = io('http://5.199.169.195:5000', {
      auth: {
        token
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socket.current.on('connect', () => {
      console.log('Socket connected');
    });

    socket.current.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      toast.error('Failed to connect to chat server');
    });

    socket.current.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect
        socket.current.connect();
      }
    });

    // Register event listeners ONCE
    socket.current.on('new-message', (message) => {
      setMessages(prev => {
        // Prevent duplicates by id
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });
      setChats(prev => prev.map(chat =>
        chat.id === message.chatId ? { ...chat, lastMessage: message } : chat
      ));
    });

    socket.current.on('user-typing', ({ userId, chatId }) => {
      if (chatId === selectedChat?.id) {
        setTypingUsers(prev => ({ ...prev, [userId]: true }));
      }
    });

    socket.current.on('user-stop-typing', ({ userId, chatId }) => {
      if (chatId === selectedChat?.id) {
        setTypingUsers(prev => ({ ...prev, [userId]: false }));
      }
    });

    return () => {
      if (socket.current) {
        socket.current.disconnect();
      }
    };
  }, []); // Only once on mount

  useEffect(() => {
    // Fetch chats and join rooms when chats change
    const fetchChats = async () => {
      try {
        const response = await axios.get('http://5.199.169.195:5000/api/chat');
        const chatsWithLast = await Promise.all(response.data.map(async (chat) => {
          try {
            const msgRes = await axios.get(`http://5.199.169.195:5000/api/chat/${chat.id}/messages`);
            const lastMsg = msgRes.data[msgRes.data.length - 1];
            return { ...chat, lastMessage: lastMsg };
          } catch {
            return { ...chat, lastMessage: null };
          }
        }));
        setChats(chatsWithLast);
        if (chatsWithLast.length > 0) {
          const stillExists = chatsWithLast.find(chat => chat.id === selectedChat?.id);
          if (stillExists) {
            setSelectedChat(stillExists);
          } else {
            setSelectedChat(chatsWithLast[0]);
          }
          if (socket.current) {
            socket.current.emit('join-chats', chatsWithLast.map(chat => chat.id));
          }
        }
      } catch (error) {
        toast.error('Failed to load chats');
      } finally {
        setLoading(false);
      }
    };
    fetchChats();
  }, [selectedChat?.id]);

  useEffect(() => {
    // Fetch messages when selectedChat changes
    const fetchMessages = async () => {
      if (selectedChat) {
        try {
          const response = await axios.get(`http://5.199.169.195:5000/api/chat/${selectedChat.id}/messages`);
          setMessages(response.data);
        } catch (error) {
          toast.error('Failed to load messages');
        }
      }
    };
    fetchMessages();

    // Fetch members for group/channel
    const fetchMembers = async () => {
      if (selectedChat && selectedChat.type !== 'private') {
        try {
          const response = await axios.get(`http://5.199.169.195:5000/api/group/${selectedChat.id}/members`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          setMembers(response.data);
        } catch (error) {
          setMembers([]);
        }
      } else {
        setMembers([]);
      }
    };
    fetchMembers();
  }, [selectedChat]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get('http://5.199.169.195:5000/api/users', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        // Filter out current user and users we already have chats with
        const filteredUsers = response.data.filter(user => 
          user.id !== user.id && 
          !chats.some(chat => 
            chat.type === 'private' && 
            chat.members.some(member => member.id === user.id)
          )
        );
        setUsers(filteredUsers);
      } catch (error) {
        toast.error('Failed to load users');
      }
    };

    if (showUserSelect) {
      fetchUsers();
    }
  }, [showUserSelect, user.id, chats]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat) return;
    try {
      await axios.post(
        `http://5.199.169.195:5000/api/chat/${selectedChat.id}/messages`,
        { content: newMessage }
      );
      socket.current.emit('send-message', {
        chatId: selectedChat.id,
        content: newMessage
      });
      setNewMessage('');
    } catch (error) {
      toast.error('Failed to send message');
    }
  };

  const handleTyping = () => {
    if (selectedChat) {
      socket.current.emit('typing', { chatId: selectedChat.id });
    }
  };

  const handleStopTyping = () => {
    if (selectedChat) {
      socket.current.emit('stop-typing', { chatId: selectedChat.id });
    }
  };

  const handleCreatePrivateChat = async (userId) => {
    try {
      const response = await axios.post('http://5.199.169.195:5000/api/chat/private', 
        { userId },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      
      // Add new chat to the list
      const newChat = {
        id: response.data.chatId,
        type: 'private',
        display_name: users.find(u => u.id === userId)?.name,
        lastMessage: null
      };
      setChats(prev => [...prev, newChat]);
      setSelectedChat(newChat);
      
      // Close modals
      setShowUserSelect(false);
      setShowNewModal(false);
      toast.success('Private chat created');
    } catch (error) {
      toast.error('Failed to create private chat');
    }
  };

  const handleDeleteChat = async () => {
    if (!selectedChat) return;
    
    try {
      await axios.delete(`http://5.199.169.195:5000/api/chat/${selectedChat.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      // Remove chat from list
      setChats(prev => prev.filter(chat => chat.id !== selectedChat.id));
      setSelectedChat(null);
      setShowDeleteConfirm(false);
      toast.success('Chat deleted successfully');
    } catch (error) {
      toast.error('Failed to delete chat');
    }
  };

  const filteredChats = chats.filter(chat =>
    chat.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  const myRole = members.find(m => m.id === user?.id)?.role;

  const canLeave = selectedChat && selectedChat.type !== 'private' && myRole && myRole !== 'owner';

  const isChannel = selectedChat && selectedChat.type === 'channel';
  const canSend = !isChannel || (myRole === 'owner' || myRole === 'admin');

  // Group members by role
  const ownerMembers = members.filter(m => m.role === 'owner');
  const adminMembers = members.filter(m => m.role === 'admin');
  const memberMembers = members.filter(m => m.role === 'member');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Chat List */}
      <div className="w-1/4 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Chats</h2>
            <button
              className="bg-primary-600 text-white px-3 py-1 rounded hover:bg-primary-700 transition"
              onClick={() => setShowNewModal(true)}
            >
              + Naujas
            </button>
          </div>
          <input
            type="text"
            placeholder="Search chats..."
            className="w-full mb-4 px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="space-y-2">
            {filteredChats.length === 0 && (
              <div className="text-gray-500 text-center py-8">No chats found</div>
            )}
            {filteredChats.map(chat => (
              <motion.div
                key={chat.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors duration-100 ${
                  selectedChat?.id === chat.id
                    ? 'bg-primary-100 dark:bg-primary-900'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                onClick={() => setSelectedChat(chat)}
              >
                {/* Avatar */}
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-primary-500 text-white font-bold text-lg">
                  {typeIcon[chat.type] || '💬'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white truncate">
                      {chat.display_name}
                    </span>
                    <span className="text-xs text-gray-400">{chat.type}</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {chat.lastMessage ? `${chat.lastMessage.senderName || ''}: ${chat.lastMessage.content}` : 'No messages yet'}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        {/* Modal for new chat/group/channel */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-xs">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Sukurti naują</h3>
              <div className="space-y-3">
                <button 
                  className="w-full py-2 rounded bg-primary-500 text-white font-medium hover:bg-primary-600" 
                  onClick={() => setShowUserSelect(true)}
                >
                  Privatus pokalbis
                </button>
                <button className="w-full py-2 rounded bg-primary-500 text-white font-medium hover:bg-primary-600" onClick={() => { setCreateType('group'); setShowCreateGroupOrChannel(true); setShowNewModal(false); }}>
                  Grupė
                </button>
                <button className="w-full py-2 rounded bg-primary-500 text-white font-medium hover:bg-primary-600" onClick={() => { setCreateType('channel'); setShowCreateGroupOrChannel(true); setShowNewModal(false); }}>
                  Kanala
                </button>
              </div>
              <button className="mt-6 w-full py-2 rounded bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium hover:bg-gray-400 dark:hover:bg-gray-600" onClick={() => setShowNewModal(false)}>
                Atšaukti
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Chat Area + Members */}
      <div className="flex-1 flex flex-row">
        <div className="flex-1 flex flex-col">
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4">
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-primary-500 text-white font-bold text-lg">
                  {typeIcon[selectedChat.type] || '💬'}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {selectedChat.display_name}
                  </h2>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {Object.values(typingUsers).some(Boolean) ? 'Typing...' : ''}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <AnimatePresence>
                  {messages.map(message => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className={`flex ${
                        (message.sender_id || message.senderId) === user.id ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-xs rounded-lg px-4 py-2 ${
                          (message.sender_id || message.senderId) === user.id
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                        }`}
                      >
                        <div className="text-sm">{message.content}</div>
                        <div className="text-xs opacity-70 mt-1">
                          {new Date(message.created_at || message.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              {canSend ? (
                <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex space-x-4">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onFocus={handleTyping}
                      onBlur={handleStopTyping}
                      className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white"
                      placeholder="Type a message..."
                    />
                    <button
                      type="submit"
                      disabled={!newMessage.trim()}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Send
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-center text-gray-400 text-sm">
                  Tik owner ir adminai gali rašyti šiame kanale
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500 dark:text-gray-400">Select a chat to start messaging</p>
            </div>
          )}
        </div>
        {/* Members sidebar for group/channel */}
        {selectedChat && selectedChat.type !== 'private' && (
          <div className="w-64 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 overflow-y-auto">
            <h3 className="text-md font-semibold mb-2 text-gray-900 dark:text-white flex items-center gap-2">
              Members <span className="text-xs text-gray-400">({members.length})</span>
            </h3>
            {(myRole === 'owner' || myRole === 'admin') && selectedChat && selectedChat.type !== 'private' && (
              <button
                className="mb-2 w-full py-2 rounded bg-primary-500 text-white font-medium hover:bg-primary-600"
                onClick={() => setShowAddMember(true)}
              >
                Pridėti narį
              </button>
            )}
            <div>
              {ownerMembers.length > 0 && <div className="font-bold text-xs text-gray-500 mb-1 mt-2">Owner</div>}
              <ul className="space-y-2">
                {ownerMembers.map(member => (
                  <li key={member.id} className="flex items-center gap-2">
                    <div className="w-8 h-8 flex items-center justify-center rounded-full bg-primary-400 text-white font-bold">{member.name[0].toUpperCase()}</div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{member.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{member.role}</div>
                    </div>
                  </li>
                ))}
              </ul>
              {adminMembers.length > 0 && <div className="font-bold text-xs text-gray-500 mb-1 mt-2">Adminai</div>}
              <ul className="space-y-2">
                {adminMembers.map(member => (
                  <li key={member.id} className="flex items-center gap-2">
                    <div className="w-8 h-8 flex items-center justify-center rounded-full bg-primary-400 text-white font-bold">{member.name[0].toUpperCase()}</div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{member.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{member.role}</div>
                    </div>
                    {/* Role management buttons (as before) */}
                    {myRole && member.id !== user.id && member.role !== 'owner' && (
                      <>
                        {myRole === 'owner' && member.role === 'admin' && (
                          <button onClick={async () => { await axios.patch(`http://5.199.169.195:5000/api/group/${selectedChat.id}/members/${member.id}/role`, { role: 'member' }); window.location.reload(); }} className="text-xs text-yellow-600 ml-2">Pašalinti admin</button>
                        )}
                        {(myRole === 'owner' || (myRole === 'admin' && member.role === 'member')) && member.role === 'member' && (
                          <button onClick={async () => { await axios.patch(`http://5.199.169.195:5000/api/group/${selectedChat.id}/members/${member.id}/role`, { role: 'admin' }); window.location.reload(); }} className="text-xs text-green-600 ml-2">Padaryti admin</button>
                        )}
                        {(myRole === 'owner' || (myRole === 'admin' && member.role === 'member')) && (
                          <button onClick={async () => { await axios.delete(`http://5.199.169.195:5000/api/group/${selectedChat.id}/members/${member.id}`); window.location.reload(); }} className="text-xs text-red-600 ml-2">Pašalinti</button>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {memberMembers.length > 0 && <div className="font-bold text-xs text-gray-500 mb-1 mt-2">Nariai</div>}
              <ul className="space-y-2">
                {memberMembers.map(member => (
                  <li key={member.id} className="flex items-center gap-2">
                    <div className="w-8 h-8 flex items-center justify-center rounded-full bg-primary-400 text-white font-bold">{member.name[0].toUpperCase()}</div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{member.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{member.role}</div>
                    </div>
                    {/* Role management buttons (as before) */}
                    {myRole && member.id !== user.id && member.role !== 'owner' && (
                      <>
                        {myRole === 'owner' && member.role === 'admin' && (
                          <button onClick={async () => { await axios.patch(`http://5.199.169.195:5000/api/group/${selectedChat.id}/members/${member.id}/role`, { role: 'member' }); window.location.reload(); }} className="text-xs text-yellow-600 ml-2">Pašalinti admin</button>
                        )}
                        {(myRole === 'owner' || (myRole === 'admin' && member.role === 'member')) && member.role === 'member' && (
                          <button onClick={async () => { await axios.patch(`http://5.199.169.195:5000/api/group/${selectedChat.id}/members/${member.id}/role`, { role: 'admin' }); window.location.reload(); }} className="text-xs text-green-600 ml-2">Padaryti admin</button>
                        )}
                        {(myRole === 'owner' || (myRole === 'admin' && member.role === 'member')) && (
                          <button onClick={async () => { await axios.delete(`http://5.199.169.195:5000/api/group/${selectedChat.id}/members/${member.id}`); window.location.reload(); }} className="text-xs text-red-600 ml-2">Pašalinti</button>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            {canLeave && (
              <button
                className="mt-4 w-full py-2 rounded bg-red-500 text-white font-medium hover:bg-red-600"
                onClick={async () => {
                  await axios.delete(`http://5.199.169.195:5000/api/group/${selectedChat.id}/leave`);
                  window.location.reload();
                }}
              >
                Išeiti iš grupės
              </button>
            )}
            {myRole === 'owner' && selectedChat && selectedChat.type !== 'private' && (
              <button
                className="mt-2 w-full py-2 rounded bg-red-700 text-white font-medium hover:bg-red-800"
                onClick={async () => {
                  await axios.delete(`http://5.199.169.195:5000/api/group/${selectedChat.id}`);
                  window.location.reload();
                }}
              >
                Ištrinti grupę
              </button>
            )}
          </div>
        )}
      </div>

      {/* User Selection Modal */}
      {showUserSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Pasirinkite vartotoją</h3>
              <button 
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                onClick={() => setShowUserSelect(false)}
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              placeholder="Ieškoti vartotojų..."
              className="w-full mb-4 px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
            <div className="max-h-60 overflow-y-auto space-y-2">
              {users
                .filter(user => 
                  user.name.toLowerCase().includes(userSearch.toLowerCase()) ||
                  user.email.toLowerCase().includes(userSearch.toLowerCase())
                )
                .map(user => (
                  <button
                    key={user.id}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => handleCreatePrivateChat(user.id)}
                  >
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-primary-500 text-white font-bold text-lg">
                      {user.name[0].toUpperCase()}
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-gray-900 dark:text-white">{user.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {showCreateGroupOrChannel && (
        <CreateGroupOrChannelModal
          type={createType}
          onClose={() => setShowCreateGroupOrChannel(false)}
          onCreated={() => window.location.reload()}
        />
      )}

      {showAddMember && (
        <AddMemberModal
          chatId={selectedChat.id}
          onClose={() => setShowAddMember(false)}
          onAdded={() => window.location.reload()}
        />
      )}
    </div>
  );
};

export default Chat; 