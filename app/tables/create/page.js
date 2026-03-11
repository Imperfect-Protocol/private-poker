// app/tables/create/page.js
"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { usePrivatePokerLobby } from '@/hooks/usePrivatePokerLobby';
import { useRequireBLS } from '@/hooks/useRequireBLS';
import { STAKES_OPTIONS } from '@/lib/stakes';
import { getGameTypeName } from '@/lib/constants';

function CreateTableForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlLobbyId = searchParams.get('lobbyId') || "1";

  // State for the blockchain-verified lobby data and existing tables
  const [lobbyInfo, setLobbyInfo] = useState({ name: "Loading...", gameType: 1 });
  const [existingTableNames, setExistingTableNames] = useState([]);
  const [submitError, setSubmitError] = useState("");
  const [isFetchingLobby, setIsFetchingLobby] = useState(true);
  const { blsKeys, isGenerating, generateKeys } = useRequireBLS();

  // Form state
  const [formData, setFormData] = useState({
    name: "New Player Table",
    buyin: STAKES_OPTIONS[2].buyin,
    blinds: STAKES_OPTIONS[2].blinds,
    maxPlayers: 2,
    lobbyId: Number(urlLobbyId)
  });

  const [isPending, setIsPending] = useState(false);

  // Bring in the read and write methods, including our optimized batch fetchers
  const { createTable, getLobbyById, getTableCount, getTablesRange } = usePrivatePokerLobby();

  // Fetch the authentic lobby data and existing table names straight from the contract
  useEffect(() => {
    const fetchLobbyAndTables = async () => {
      try {
        setIsFetchingLobby(true);

        // 1. Direct O(1) lookup for the Lobby (no more looping)
        const lobbyData = await getLobbyById(urlLobbyId);

        setLobbyInfo({
          name: lobbyData.name,
          gameType: lobbyData.gameType
        });

        // 2. Fetch all existing tables in one batch call to check for name collisions
        const count = await getTableCount(urlLobbyId);
        if (count > 0) {
          const rawTables = await getTablesRange(urlLobbyId, 0, count);
          const names = rawTables.map(table => table.name.toLowerCase());
          setExistingTableNames(names);
        } else {
          setExistingTableNames([]);
        }

      } catch (error) {
        console.error("Failed to fetch authentic lobby info:", error);
        setLobbyInfo({ name: "Lobby Not Found", gameType: 1 });
      } finally {
        setIsFetchingLobby(false);
      }
    };

    fetchLobbyAndTables();
  }, [urlLobbyId]);

  // Derived state to check if the current input name already exists (case-insensitive)
  const isNameTaken = existingTableNames.includes(formData.name.trim().toLowerCase());

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(""); // Clear old errors

    const cleanName = formData.name.trim();

    // --- PARAMETER VALIDATION ---
    if (!cleanName) {
      setSubmitError("Table name cannot be empty.");
      return;
    }
    if (cleanName.length > 32) {
      setSubmitError("Table name is too long (max 32 characters).");
      return;
    }
    if (isNameTaken) {
      setSubmitError("A table with this name already exists.");
      return;
    }
    if (!formData.buyin || formData.buyin <= 0) {
      setSubmitError("Invalid buy-in amount.");
      return;
    }
    if (!formData.lobbyId || formData.lobbyId <= 0) {
      setSubmitError("Invalid Lobby ID.");
      return;
    }
    if (!blsKeys?.publicKey) {
      setSubmitError("Session key missing. Please authorize your session.");
      return;
    }

    // --- EXECUTION ---
    try {
      setIsPending(true);
      const tableId = Date.now();

      const txHash = await createTable(
        formData.lobbyId,
        tableId,
        cleanName,
        formData.buyin,
        `0x${blsKeys.publicKey}`
      );

      console.log("Success:", txHash);
      router.push(`/tables/${tableId}`);

    } catch (error) {
      console.error(error);
      setSubmitError("Transaction failed or was rejected by the wallet.");
    } finally {
      setIsPending(false);
    }
  };

  const handleCancel = () => {
    window.close();
  };

  return (
    <div className="relative z-10 w-full max-w-lg bg-slate-900/90 backdrop-blur-xl border border-teal-500/30 rounded-2xl shadow-[0_0_50px_rgba(20,184,166,0.15)] overflow-hidden">

      <div className="bg-slate-950/50 p-6 border-b border-teal-500/20">
        <p className="text-teal-500 font-mono text-xs tracking-[0.3em] uppercase mb-1">
          Private Poker
        </p>
        <h1 className="text-2xl font-black text-white tracking-tighter uppercase">
          Create New Table
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">

        {/* 1. Disabled Lobby Name Field */}
        <div>
          <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Lobby</label>
          <input
            type="text"
            value={isFetchingLobby ? "Loading..." : lobbyInfo.name}
            className="w-full bg-slate-950 border border-slate-700 text-slate-500 text-sm font-bold px-4 py-3 rounded-lg focus:outline-none cursor-not-allowed"
            disabled
          />
        </div>

        {/* 2. Editable Table Name Field with Validation */}
        <div>
          <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Table Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className={`w-full bg-slate-950 border text-sm font-bold px-4 py-3 rounded-lg focus:outline-none transition-all ${isNameTaken
              ? 'border-red-500 text-red-400 focus:border-red-500 focus:shadow-[0_0_15px_rgba(239,68,68,0.2)]'
              : 'border-slate-700 text-teal-400 focus:border-teal-400 focus:shadow-[0_0_15px_rgba(20,184,166,0.2)]'
              }`}
            required
            disabled={isPending || isFetchingLobby}
          />
          {isNameTaken && (
            <p className="text-red-500 text-[10px] mt-1 font-mono tracking-wider">
              * A table with this name already exists in this lobby.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* Mapped Game Type */}
          <div>
            <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Game Type</label>
            <input
              type="text"
              value={isFetchingLobby ? "..." : getGameTypeName(lobbyInfo.gameType)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-500 text-sm font-bold px-4 py-3 rounded-lg focus:outline-none transition-all cursor-not-allowed"
              disabled
            />
          </div>

          <div>
            <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Capacity</label>
            <select
              value={formData.maxPlayers}
              onChange={(e) => setFormData({ ...formData, maxPlayers: Number(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-700 text-slate-300 text-sm font-bold px-4 py-3 rounded-lg focus:outline-none focus:border-teal-400 transition-all appearance-none cursor-pointer font-mono"
              disabled={isPending || isFetchingLobby}
            >
              <option value={2}>2 Players (Heads Up)</option>
              <option value={3}>3 Players</option>
              <option value={4}>4 Players</option>
              <option value={6}>6 Players (Max)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-teal-600 font-mono uppercase mb-2 tracking-widest">Stakes & Buy-In</label>
          <select
            value={formData.buyin}
            onChange={(e) => {
              const selectedValue = Number(e.target.value);
              const selectedOption = STAKES_OPTIONS.find(opt => opt.buyin === selectedValue);
              if (selectedOption) {
                setFormData({
                  ...formData,
                  buyin: selectedOption.buyin,
                  blinds: selectedOption.blinds
                });
              }
            }}
            className="w-full bg-slate-950 border border-slate-700 text-teal-400 text-sm font-bold px-4 py-3 rounded-lg focus:outline-none focus:border-teal-400 transition-all appearance-none cursor-pointer font-mono focus:shadow-[0_0_15px_rgba(20,184,166,0.2)]"
            disabled={isPending || isFetchingLobby}
          >
            {STAKES_OPTIONS.map((opt) => (
              <option key={opt.buyin} value={opt.buyin}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-4 mt-6 pt-6 border-t border-slate-800">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isPending}
            className="flex-1 py-3 rounded-lg border border-slate-700 text-slate-400 font-bold hover:bg-slate-800 hover:text-slate-200 transition-colors uppercase text-xs tracking-widest disabled:opacity-50 cursor-pointer"
          >
            Abort
          </button>

          {/* RENDER BUTTON A: If they don't have keys, force them to get keys first */}
          {!blsKeys ? (
            <button
              type="button" // Important: Not a submit button!
              onClick={generateKeys}
              disabled={isGenerating}
              className="flex-[2] py-3 rounded-lg bg-teal-600 text-slate-950 font-black hover:bg-teal-500 transition-colors uppercase text-xs tracking-widest shadow-[0_0_20px_rgba(20,184,166,0.3)] disabled:opacity-50 cursor-pointer"
            >
              {isGenerating ? "Generating Session Key..." : "Authorize Session to Continue"}
            </button>
          ) : (
            /* RENDER BUTTON B: The actual form submitter */
            <button
              type="submit"
              // The critical fix: disable if the lobby doesn't exist!
              disabled={isPending || isFetchingLobby || isNameTaken || formData.name.trim() === "" || lobbyInfo.name === "Lobby Not Found"}
              className="flex-[2] py-3 rounded-lg bg-teal-500 text-slate-950 font-black hover:bg-teal-400 transition-colors uppercase text-xs tracking-widest shadow-[0_0_20px_rgba(20,184,166,0.3)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex justify-center items-center"
            >
              {isPending ? (
                <span className="animate-pulse">Awaiting Signature...</span>
              ) : isFetchingLobby ? (
                <span className="animate-pulse">Verifying Data...</span>
              ) : lobbyInfo.name === "Lobby Not Found" ? (
                "Error: Lobby Missing"
              ) : (
                "Create & Buy-in"
              )}
            </button>
          )}
        </div>
        {submitError && (
          <div className="p-3 bg-red-900/50 border border-red-500/50 rounded-lg text-red-400 text-xs font-bold uppercase tracking-widest text-center">
            {submitError}
          </div>
        )}

      </form>
    </div>
  );
}

export default function CreateTablePage() {
  return (
    <main className="min-h-screen bg-slate-950 relative flex items-center justify-center p-4">
      <div className="absolute inset-0 z-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-teal-900 via-slate-950 to-slate-950" />
      <Suspense fallback={
        <div className="relative z-10 w-full max-w-lg text-center py-16 text-teal-600/50 font-mono text-xs uppercase tracking-widest border border-dashed border-teal-500/20 rounded-xl bg-slate-900/30">
          Loading Data Terminal...
        </div>
      }>
        <CreateTableForm />
      </Suspense>
    </main>
  );
}