'use client';

import { Card, CardBody, Button } from '@/components/ui';
import { Bot, Send, TrendingUp, Users, Target, Lightbulb } from 'lucide-react';
import { useState } from 'react';

const suggestions = [
  { icon: TrendingUp, text: 'Bu ay satış performansım nasıl?', answer: 'Satış performansınızı Performans sayfasından detaylı görebilirsiniz. Dashboard\'da genel özet mevcuttur.' },
  { icon: Users, text: 'En iyi müşterilerim kimler?', answer: 'Müşteriler sayfasında VIP filtresi kullanarak en değerli müşterilerinizi görebilirsiniz.' },
  { icon: Target, text: 'Hedeflerime ne kadar yakınım?', answer: 'Hedefler sayfasında aylık hedeflerinizi ve ilerlemenizi takip edebilirsiniz.' },
  { icon: Lightbulb, text: 'Satışlarımı nasıl artırabilirim?', answer: 'Fırsatlar sayfasındaki pipeline\'ı takip edin, Müzakere aşamasındaki fırsatlara öncelik verin ve CRM ile müşteri takibini aksatmayın.' },
];

interface Message {
  role: string;
  content: string;
}

export default function AIPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Merhaba! Ben Satış Pro AI Asistanınızım. Size satış süreçleriniz hakkında yardımcı olabilirim. Aşağıdaki önerilerden birini seçin veya sorunuzu yazın.' }
  ]);

  const handleSuggestion = (q: string, a: string) => {
    setMessages([...messages, { role: 'user', content: q }, { role: 'assistant', content: a }]);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input;
    setInput('');
    setMessages([...messages, { role: 'user', content: userMsg }, { role: 'assistant', content: 'Bu özellik yakında aktif olacak. Şimdilik yukarıdaki önerilerden birini kullanabilir veya ilgili sayfaları ziyaret edebilirsiniz.' }]);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
          <Bot className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">AI Asistan</h1>
          <p className="text-sm text-slate-500">Satış süreçleriniz için akıllı yardımcınız</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardBody className="h-96 overflow-y-auto space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-3 rounded-xl ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {m.content}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {suggestions.map((s, i) => (
          <button key={i} onClick={() => handleSuggestion(s.text, s.answer)} className="flex items-center gap-3 p-3 bg-white border border-slate-200 hover:bg-slate-50 hover:border-blue-300 rounded-lg text-left text-sm transition-all shadow-sm">
            <s.icon className="h-5 w-5 text-blue-600 shrink-0" />
            <span className="text-slate-700">{s.text}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Sorunuzu yazın..."
          className="flex-1 h-12 px-4 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
        />
        <Button onClick={handleSend} className="h-12 px-6">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
