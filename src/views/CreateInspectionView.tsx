import { useState, useEffect, useMemo } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { api } from "../lib/api";
import { Section } from "../types";
import { Plus, Trash2, Camera, Loader2, CheckCircle, MapPin, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

const observationSchema = z.object({
  sectionId: z.string().min(1, "Section is required"),
  description: z.string().min(3, "Description is required"),
  beforeImageUrl: z.string().optional().or(z.literal("")),
});

const inspectionSchema = z.object({
  date: z.string(),
  location: z.string().min(1, "Location is required"),
  observations: z.array(observationSchema).min(1, "At least one observation is required"),
});

type InspectionFormValues = z.infer<typeof inspectionSchema>;

export default function CreateInspectionView() {
  const [sections, setSections] = useState<Section[]>([]);
  const [existingLocations, setExistingLocations] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const navigate = useNavigate();

  const { register, control, handleSubmit, formState: { errors } } = useForm<InspectionFormValues>({
    resolver: zodResolver(inspectionSchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      observations: [{ sectionId: "", description: "", beforeImageUrl: "" }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "observations"
  });

  useEffect(() => {
    api.getSections().then(setSections);
    Promise.all([api.getInspections(), api.getObservations()]).then(([ins, obs]) => {
      const locs = new Set<string>();
      ins.forEach(i => {
        if (i.location && !i.location.includes('@')) {
          locs.add(i.location);
        }
      });
      obs.forEach(o => {
        if (o.location && !o.location.includes('@')) {
          locs.add(o.location);
        }
      });
      setExistingLocations(Array.from(locs).sort());
    });
  }, []);

  const allLocations = useMemo(() => {
    return existingLocations;
  }, [existingLocations]);

  const onSubmit = async (data: InspectionFormValues) => {
    setIsSubmitting(true);
    try {
      const inspection = await api.createInspection({
        date: data.date,
        location: data.location,
        sectionId: data.observations[0]?.sectionId // fallback for legacy logic
      });

      // Parallel observation creation
      await Promise.all(data.observations.map(obs => 
        api.createObservation({
          ...obs,
          location: data.location, // Apply top-level location to all obs
          inspectionId: inspection.id
        })
      ));

      setIsSuccess(true);
      setTimeout(() => navigate("/inspections"), 1500);
    } catch (e) {
      console.error(e);
      alert("Failed to save inspection. Check console.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <header className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">New Site Inspection</h2>
        <p className="text-xs text-slate-500">Record fresh observations to the inspection database.</p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Core Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Inspection Date</label>
            <input 
              type="date" 
              {...register("date")}
              className="w-full bg-slate-100 border-none rounded-lg text-sm px-4 py-2 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Location</label>
            <div className="relative group/select">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 group-focus-within/select:text-blue-700 transition-colors pointer-events-none" size={14} />
              <select 
                {...register("location")}
                className="w-full bg-blue-50 border-none rounded-lg text-sm px-4 py-2 pl-10 focus:ring-1 focus:ring-blue-500 transition-all font-bold appearance-none cursor-pointer text-blue-700"
              >
                <option value="" className="text-slate-500">Select a location...</option>
                {allLocations.map(loc => <option key={loc} value={loc} className="text-slate-900">{loc}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" size={14} />
            </div>
            {errors.location && <p className="text-rose-500 text-[10px] mt-1 font-bold">{errors.location.message}</p>}
          </div>
        </div>

        {/* Observations */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-tight">Observations ({fields.length})</h3>
            <button
              type="button"
              onClick={() => append({ sectionId: "", description: "", beforeImageUrl: "" })}
              className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-slate-700 transition-all active:scale-95"
            >
              <Plus size={14} />
              Add Entry
            </button>
          </div>

          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {fields.map((field, index) => (
                <motion.div
                  key={field.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative group"
                >
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="absolute top-4 right-4 p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase text-slate-400">Target Section</label>
                      <div className="relative group/select">
                        <select 
                          {...register(`observations.${index}.sectionId` as const)}
                          className="w-full bg-slate-50 border border-slate-100 rounded-lg text-xs px-3 py-2 focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer hover:border-slate-200 transition-all font-medium"
                        >
                          <option value="">Select Section...</option>
                          {sections.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none group-hover/select:text-slate-400" size={12} />
                      </div>
                      {errors.observations?.[index]?.sectionId && (
                        <p className="text-rose-500 text-[10px] font-bold">{errors.observations[index].sectionId?.message}</p>
                      )}
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[9px] font-bold uppercase text-slate-400">Observation Finding (Rich Text)</label>
                      <Controller
                        name={`observations.${index}.description` as const}
                        control={control}
                        render={({ field }) => (
                          <div className="quill-wrapper">
                            <ReactQuill 
                              theme="snow"
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="Describe the finding in detail..."
                              className="bg-slate-50 border border-slate-100 rounded-lg overflow-hidden"
                              modules={{
                                toolbar: [
                                  ['bold', 'italic', 'underline'],
                                  [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                  ['clean']
                                ],
                              }}
                            />
                          </div>
                        )}
                      />
                      {errors.observations?.[index]?.description && (
                        <p className="text-rose-500 text-[10px] font-bold">{errors.observations[index].description?.message}</p>
                      )}
                    </div>
                    <div className="md:col-span-3 space-y-1">
                      <label className="text-[9px] font-bold uppercase text-slate-400">Attachment (URL)</label>
                      <div className="relative">
                        <Camera className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                        <input 
                          placeholder="Public image URL"
                          {...register(`observations.${index}.beforeImageUrl` as const)}
                          className="w-full bg-slate-50 border border-slate-100 rounded-lg text-xs px-3 py-2 pl-9 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="pt-4 flex gap-3">
           <button
             type="submit"
             disabled={isSubmitting || isSuccess}
             className={cn(
               "flex-1 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2",
               isSuccess ? "bg-emerald-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 active:translate-y-px"
             )}
           >
             {isSubmitting ? (
               <Loader2 className="animate-spin w-4 h-4" />
             ) : isSuccess ? (
               <>
                 <CheckCircle size={16} />
                 Data Synced Successfully
               </>
             ) : (
               "Commit Inspection Log"
             )}
           </button>
           <button 
             type="button" 
             onClick={() => navigate("/")}
             className="px-6 py-3 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-300 transition-colors"
           >
             Cancel
           </button>
        </div>
      </form>
    </div>
  );
}
