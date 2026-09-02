 'use client'

 import { Monitor, CreditCard, ArrowRight } from 'lucide-react'

 export function DecisionCards({ onNewBusiness, onExistingBusiness }: { onNewBusiness: () => void; onExistingBusiness: () => void }) {
   return (
     <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
         {/* Card 1 - New Business (white) */}
        <button
          onClick={onNewBusiness}
          className="group relative block text-left rounded-2xl border-2 border-blue-600 bg-white p-8 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:bg-blue-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
           <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center transition-colors duration-200 group-hover:bg-white">
               <Monitor className="h-7 w-7 text-blue-600 transition-colors duration-200" />
             </div>
             <div className="flex-1">
              <h3 className="text-xl font-bold text-slate-900 group-hover:text-white transition-colors">I'm Opening a Business</h3>
               <p className="mt-2 text-sm text-slate-600 group-hover:text-white transition-colors">
                 Get a simple payment setup built around how you sell — in person, online, mobile, or at the counter.
               </p>
               <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 group-hover:text-white">
                 <span>Explore POS &amp; Equipment</span>
                 <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
               </div>
             </div>
           </div>
         </button>

         {/* Card 2 - Existing Business (blue) */}
        <button
          onClick={onExistingBusiness}
          className="group relative block text-left rounded-2xl border border-blue-600 bg-blue-600 text-white p-8 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:bg-white hover:text-slate-900 hover:border-2 hover:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
           <div className="flex items-start gap-4">
             <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center transition-colors duration-200 group-hover:bg-blue-50">
               <CreditCard className="h-7 w-7 text-white transition-colors duration-200 group-hover:text-blue-600" />
             </div>
             <div className="flex-1">
               <h3 className="text-xl font-bold text-white group-hover:text-slate-900 transition-colors">I Already Accept Cards</h3>
               <p className="mt-2 text-sm text-blue-100 group-hover:text-slate-700 transition-colors">
                 Send a recent processing statement and get a clear savings proposal in about 15 minutes.
               </p>
               <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white group-hover:text-blue-600">
                 <span>Get My Free Review</span>
                 <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" />
               </div>
             </div>
           </div>
         </button>
       </div>
     </div>
   )
 }

