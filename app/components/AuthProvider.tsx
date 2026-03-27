'use client'

import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { createClient } from '@/app/utils/supabase/client'
import type { User, SupabaseClient } from '@supabase/supabase-js'
import { useManifestStore } from '@/app/stores/manifestStore'
import { useSelectionStore } from '@/app/stores/selectionStore'
import { useAudioStore } from '@/app/stores/audioStore'

interface Profile {
  id: string
  is_pro: boolean
  requests_remaining: number
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  supabase: SupabaseClient | null
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  supabase: null,
  refreshProfile: async () => {},
})

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  
  const supabase = useMemo(() => createClient(), [])

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      
      if (error) {
        console.error('Error fetching profile:', error)
      } else {
        setProfile(data)
      }
    } catch (err) {
      console.error('Fetch profile error:', err)
    }
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id)
    }
  }

  useEffect(() => {
    const getUser = async () => {
      try {
        const {
          data: { user },
          error
        } = await supabase.auth.getUser()
        
        if (error) {
          console.error('getUser error:', error)
        }
        
        setUser(user)
        setLoading(false) // Set loading to false as soon as session is checked
        
        if (user) {
          fetchProfile(user.id)
        }
      } catch (err) {
        console.error('Error in getUser:', err)
        setLoading(false)
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          useManifestStore.getState().resetStore()
          useSelectionStore.getState().clearSelection()
          useAudioStore.getState().removeAudio()
          setProfile(null)
        }
        const newUser = session?.user ?? null
        setUser(newUser)
        if (newUser) {
          fetchProfile(newUser.id)
        } else {
          setProfile(null)
        }
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  const value = useMemo(() => ({ user, profile, loading, supabase, refreshProfile }), [user, profile, loading, supabase])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
