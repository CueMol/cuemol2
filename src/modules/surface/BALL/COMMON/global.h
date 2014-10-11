// -*- Mode: C++; tab-width: 2; -*-
// vi: set ts=2:
//

#ifndef BALL_COMMON_GLOBAL_H
#define BALL_COMMON_GLOBAL_H

# define BALL_EXPORT
# define BALL_HIDE
# define BALL_VIEW_EXPORT
# define BALL_EXTERN_VARIABLE extern
#define BALL_DEPRECATED


namespace BALL
{


	/**	@name Type aliases defined by BALL.
			These predefined types are used in BALL for portability and
			comprehensibility.
			
	\ingroup Common
	*/
	//@{

	/**	Distance type.
			Use this type to represent distances in indices. Signed.
			 \par
			<b>Size:</b> 32 bit \par
			<b>persistent</b>
	*/
	typedef BALL_INDEX_TYPE	Distance; 

	/**	Handle type.
			Use this type to represent <b>handles</b>. Handles are used
			for the non-ambiguous identification of objects (e.g. object derived
      from  \link Object Object \endlink ). Handles are unsigned.
			 \par
			<b>Size:</b> 32 bit \par
			<b>persistent</b>
  */
	typedef BALL_SIZE_TYPE 	Handle;

	/**	Index type.
			Use this type to represent indices (e.g. in strings or other sequences).
			Theses indices may be signed, contrary to the  \link ::Size Size \endlink  type.
			 \par
			<b>Size:</b> 32 bit \par
			<b>persistent</b>
	*/
	typedef BALL_INDEX_TYPE	Index;

	/**	Size type.
			Use this type to represent sizes of containers, sequences or alike.
			Variables of type Size are unsigned.
			 \par
			<b>Size:</b> 32 bit \par
			<b>persistent</b>
	*/
	typedef BALL_SIZE_TYPE 	Size;

	/**	HashIndex type.
			Use this type to access the result of a hash functions. HashIndex is unsigned.
			 \par
			<b>Size:</b> 32 bit \par
			<b>persistent</b>
	*/
	typedef	BALL_SIZE_TYPE	HashIndex;

	/**	Position type.
			Use this type to represent positions (e.g. in a container) that
			cannot be negative (contrary to  \link ::Index Index \endlink ).
			 \par
			<b>Size:</b> 32 bit \par
			<b>persistent</b>
	*/
	typedef	BALL_SIZE_TYPE	Position;

	/**	Real type.
			Use this type to represent standard floating point numbers.
			 \par
			<b>Size:</b> 32 bit \par
			<b>persistent</b>
	*/
	typedef float Real;

	/**	Double-precision real type.
			Use this type to represent double precision floating point numbers.
			 \par
			<b>Size:</b> 64 bit \par
			<b>persistent</b>
	*/
	typedef double DoubleReal;

	/**	Byte type.
			Use this type to represent byte data (8 bit length).
			A Byte is always unsigned.
			 \par
			<b>Size:</b> 8 bit \par
			<b>persistent</b>
	*/
	typedef	unsigned char Byte;

	/**	Long unsigned int type.
			This type holds unsigned 64 bit integer numbers and is used to store pointers
			in a portable fashion (for both 32-bit and 64-bit systems).
			 \par
			<b>Size:</b> 64 bit \par
			<b>persistent</b>
	*/
	typedef BALL_ULONG64_TYPE LongSize;

	/**	Long signed int type.
			This type holds unsigned 64 bit numbers and is used to store pointers
			in a portable fashion (for both 32-bit and 64-bit systems).
			 \par
			<b>Size:</b> 64 bit \par
			<b>persistent</b>
	*/
	typedef BALL_LONG64_TYPE LongIndex;

	/** Unsigned int with the same size as a pointer.
			Used for internal conversion issues mostly.
			<b>Size:</b> 32/64 bit (platform dependent)\par
	*/
	typedef BALL_POINTERSIZEUINT_TYPE PointerSizeUInt;

	//@}

	static const Distance INVALID_DISTANCE = INT_MIN;
	static const Distance DISTANCE_MIN = (INT_MIN + 1);
	static const Distance DISTANCE_MAX = INT_MAX;

	static const Handle INVALID_HANDLE = INT_MAX;
	static const Handle HANDLE_MIN = 0 ;
	static const Handle HANDLE_MAX = INT_MAX - 1;

	static const Index INVALID_INDEX = -1;
	static const Index INDEX_MIN = 0;
	static const Index INDEX_MAX = INT_MAX;

	static const Position INVALID_POSITION = INT_MAX;
	static const Position POSITION_MIN = 0;
	static const Position POSITION_MAX = INT_MAX - 1;

#	undef SIZE_MAX
	static const Size INVALID_SIZE = INT_MAX;
	static const Size SIZE_MIN = 0;
	static const Size SIZE_MAX = INT_MAX - 1;
	
	
}


#endif // BALL_COMMON_GLOBAL_H
